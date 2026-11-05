-- Crear tabla users que Prisma espera
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    email_verified TIMESTAMPTZ,
    password_hash TEXT,
    name TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    image TEXT,
    google_sub TEXT,
    signup_ip_hash TEXT,
    vote_invites_opt_out BOOLEAN NOT NULL DEFAULT false,
    session_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_signup_ip_hash ON users(signup_ip_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
