-- schema.sql  (v2 – production-ready)
-- Drop tables in dependency order
DROP TABLE IF EXISTS System_Config   CASCADE;
DROP TABLE IF EXISTS Audit_Logs      CASCADE;
DROP TABLE IF EXISTS Votes           CASCADE;
DROP TABLE IF EXISTS Candidates      CASCADE;
DROP TABLE IF EXISTS Positions       CASCADE;
DROP TABLE IF EXISTS Voters          CASCADE;
DROP TABLE IF EXISTS Admins          CASCADE;

-- ─── 1. Admins ────────────────────────────────────────────────────────────────
CREATE TABLE Admins (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) UNIQUE NOT NULL,
    password   VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── 2. Voters ────────────────────────────────────────────────────────────────
-- registration_number follows MMUST format: PROG/LEVEL/CAMPUS/SERIAL/YEAR
-- e.g.  EDS/B/01/04349/2021
CREATE TABLE Voters (
    id                  SERIAL PRIMARY KEY,
    registration_number VARCHAR(50)  UNIQUE NOT NULL,
    email_address       VARCHAR(255) UNIQUE NOT NULL,
    password            VARCHAR(255) NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    gender              VARCHAR(10)  CHECK (gender IN ('Male', 'Female')),
    residence_zone      VARCHAR(100) NOT NULL,
    school_id           VARCHAR(50)  NOT NULL,
    is_approved         BOOLEAN      DEFAULT FALSE,
    has_voted           BOOLEAN      DEFAULT FALSE,
    otp                 VARCHAR(10),
    otp_expires_at      TIMESTAMP,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─── 3. Positions ─────────────────────────────────────────────────────────────
CREATE TABLE Positions (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    target_group VARCHAR(50)  CHECK (target_group IN ('ALL', 'SCHOOL', 'RESIDENTIAL')),
    target_value VARCHAR(255) -- e.g., 'SCI' or 'Hall 1' or NULL if ALL
);

-- ─── 4. Candidates ────────────────────────────────────────────────────────────
-- voter_registration_number links the candidate back to a registered voter
-- (not a hard FK so the candidate record survives voter edits)
CREATE TABLE Candidates (
    id                       SERIAL PRIMARY KEY,
    voter_registration_number VARCHAR(50) NOT NULL,  -- must exist in Voters
    full_name                VARCHAR(255) NOT NULL,
    gender                   VARCHAR(10)  CHECK (gender IN ('Male', 'Female')),
    position_id              INTEGER      REFERENCES Positions(id) ON DELETE CASCADE,
    photo_url                VARCHAR(500),            -- relative path to uploaded photo
    active                   BOOLEAN      DEFAULT TRUE,
    is_approved              BOOLEAN      DEFAULT FALSE,
    created_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─── 5. Votes (anonymous – no FK back to Voters) ─────────────────────────────
CREATE TABLE Votes (
    id           SERIAL PRIMARY KEY,
    candidate_id INTEGER UNIQUE REFERENCES Candidates(id) ON DELETE CASCADE,
    vote_count   INTEGER DEFAULT 0
);

-- ─── 6. Audit Logs ────────────────────────────────────────────────────────────
CREATE TABLE Audit_Logs (
    id          SERIAL PRIMARY KEY,
    timestamp   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(100) NOT NULL,
    description TEXT         NOT NULL,
    admin_id    INTEGER      REFERENCES Admins(id) ON DELETE SET NULL
);

-- ─── 6. System Configuration ─────────────────────────────────────────────────
CREATE TABLE System_Config (
    key_name  VARCHAR(50) PRIMARY KEY,
    key_value VARCHAR(50) NOT NULL
);

-- Seed defaults
INSERT INTO System_Config (key_name, key_value) VALUES ('election_status', 'Pending');
