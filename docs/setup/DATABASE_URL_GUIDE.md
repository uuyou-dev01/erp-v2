# How to Find Your DATABASE_URL

## 🔍 Understanding DATABASE_URL Format

The DATABASE_URL follows this pattern:

```
postgresql://[username]:[password]@[host]:[port]/[database]?schema=public
```

**Parts explained:**
- `username` - PostgreSQL user (default is your macOS username)
- `password` - User's password (optional for local dev)
- `host` - Server address (usually `localhost` for local)
- `port` - PostgreSQL port (default is `5432`)
- `database` - Database name (we'll use `erp_v2`)

## 📋 Step-by-Step Setup

### Step 1: Install PostgreSQL

Since you don't have PostgreSQL installed yet, let's install it:

```bash
# Install PostgreSQL using Homebrew
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15
```

### Step 2: Verify Installation

```bash
# Check PostgreSQL version
psql --version

# Should output: psql (PostgreSQL) 15.x
```

### Step 3: Find Your Username

```bash
# Your macOS username (this is your default PostgreSQL user)
whoami
```

Your username is: **uuyxn**

### Step 4: Determine Your DATABASE_URL

For a fresh PostgreSQL installation on macOS, you have **two options**:

#### Option A: Simple (No Password) - RECOMMENDED for local development

```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"
```

This works because:
- PostgreSQL on macOS trusts local connections by default
- Your macOS user `uuyxn` automatically becomes a PostgreSQL user
- No password needed for local development

#### Option B: With Password (More Secure)

If you want to set a password:

```bash
# Connect to PostgreSQL
psql postgres

# Set password for your user
ALTER USER uuyxn WITH PASSWORD 'your_password_here';

# Exit
\q
```

Then use:
```env
DATABASE_URL="postgresql://uuyxn:your_password_here@localhost:5432/erp_v2?schema=public"
```

## 🎯 Quick Setup Commands

Here's the complete setup in order:

```bash
# 1. Install PostgreSQL
brew install postgresql@15

# 2. Start PostgreSQL
brew services start postgresql@15

# 3. Create database
createdb erp_v2

# 4. Create .env file
cp .env.example .env
```

Then edit `.env` and set:

```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"
```

## ✅ Test Your Connection

```bash
# Test if you can connect
psql -d erp_v2 -c "SELECT version();"
```

If this works, your DATABASE_URL is correct! ✅

## 🔧 Troubleshooting

### Error: "psql: command not found"

PostgreSQL is not installed. Run:
```bash
brew install postgresql@15
```

### Error: "connection refused"

PostgreSQL is not running. Start it:
```bash
brew services start postgresql@15
```

### Error: "database does not exist"

Create the database:
```bash
createdb erp_v2
```

### Error: "role does not exist"

Your user doesn't exist in PostgreSQL. Create it:
```bash
psql postgres -c "CREATE USER uuyxn WITH SUPERUSER;"
```

## 📝 Your Specific Setup

Based on your system, here's what you should use:

**1. Create `.env` file:**
```bash
cp .env.example .env
```

**2. Edit `.env` and set:**
```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"
```

**3. That's it!** This should work for local development.

## 🚀 Complete Setup Script

Run this to set everything up:

```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL
brew services start postgresql@15

# Wait a moment for it to start
sleep 3

# Create database
createdb erp_v2

# Create .env file
cp .env.example .env

# Update .env with your DATABASE_URL
echo 'DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"' > .env

# Install dependencies
npm install

# Run migrations
npx prisma migrate dev --name init

# Seed data
npm run db:seed

# Start dev server
npm run dev
```

## 🎉 Done!

Your DATABASE_URL is:
```
postgresql://uuyxn@localhost:5432/erp_v2?schema=public
```

This will work for local development on your Mac!
