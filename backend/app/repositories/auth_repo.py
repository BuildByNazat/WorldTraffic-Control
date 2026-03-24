"""
Authentication repository and helpers for MVP account sessions.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Optional, Tuple

from sqlalchemy import delete, select

from app.db import async_session_factory
from app.models_db import UserAccount, UserSession
from app.schemas import UserProfile

PBKDF2_ITERATIONS = 120_000


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    ).hex()


def create_password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _hash_password(password, salt)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt_hex, expected_digest = password_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    computed_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        int(iteration_text),
    ).hex()
    return hmac.compare_digest(computed_digest, expected_digest)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _to_profile(user: UserAccount) -> UserProfile:
    return UserProfile(id=user.id, email=user.email, created_at=user.created_at)


async def get_user_by_email(email: str) -> Optional[UserAccount]:
    normalized_email = _normalize_email(email)
    async with async_session_factory() as session:
        return (
            await session.execute(
                select(UserAccount).where(UserAccount.email == normalized_email)
            )
        ).scalar_one_or_none()


async def create_user(email: str, password: str) -> UserProfile:
    normalized_email = _normalize_email(email)
    async with async_session_factory() as session:
        row = UserAccount(
            email=normalized_email,
            password_hash=create_password_hash(password),
            created_at=_utcnow(),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _to_profile(row)


async def authenticate_user(email: str, password: str) -> Optional[UserProfile]:
    row = await get_user_by_email(email)
    if row is None or not verify_password(password, row.password_hash):
        return None
    return _to_profile(row)


async def create_session_for_user(user_id: int) -> str:
    raw_token = secrets.token_urlsafe(32)
    async with async_session_factory() as session:
        row = UserSession(
            user_id=user_id,
            token_hash=_token_hash(raw_token),
            created_at=_utcnow(),
            last_seen_at=_utcnow(),
        )
        session.add(row)
        await session.commit()
    return raw_token


async def get_user_for_token(token: str) -> Optional[UserProfile]:
    async with async_session_factory() as session:
        row: Optional[Tuple[UserSession, UserAccount]] = (
            await session.execute(
                select(UserSession, UserAccount)
                .join(UserAccount, UserAccount.id == UserSession.user_id)
                .where(UserSession.token_hash == _token_hash(token))
            )
        ).first()
        if row is None:
            return None
        session_row, user_row = row
        session_row.last_seen_at = _utcnow()
        await session.commit()
        return _to_profile(user_row)


async def delete_session(token: str) -> None:
    async with async_session_factory() as session:
        await session.execute(
            delete(UserSession).where(UserSession.token_hash == _token_hash(token))
        )
        await session.commit()
