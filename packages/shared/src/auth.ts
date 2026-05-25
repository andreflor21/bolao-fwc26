export type UserRole = 'player' | 'subscriber' | 'admin';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponseDto {
  user: UserDto;
  tokens: AuthTokensDto;
}
