from typing import Literal

from pydantic import BaseModel, EmailStr, Field


LanguageCode = Literal["ru", "en"]
TrackCode = Literal["A", "B", "C"]
UserRole = Literal["student", "admin"]
LessonKind = Literal["mandatory", "optional"]
HomeworkVerdict = Literal["approved", "rejected"]


class SignupRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=80)
    lastName: str = Field(min_length=1, max_length=80)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)
    language: LanguageCode


class LoginRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ActivateLicenseRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=80)
    lastName: str = Field(min_length=1, max_length=80)
    email: EmailStr = Field(max_length=254)
    token: str = Field(min_length=8, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    language: LanguageCode


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=16)


class RequestResetRequest(BaseModel):
    email: str = Field(max_length=254)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=12, max_length=128)
    newPassword: str = Field(min_length=8, max_length=128)
