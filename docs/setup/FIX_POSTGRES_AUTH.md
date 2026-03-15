# Fix PostgreSQL Authentication Error

## 🔴 The Problem

You're getting: "Authentication failed for `postgres`"

This means the `postgres` user requires a password.

## ✅ Solution: Find Your pgAdmin Username & Password

### Step 1: Check Your pgAdmin Connection

1. **Open pgAdmin 4**
2. Look at the left sidebar under **"Servers"**
3. **Right-click** on **"PostgreSQL 17"**
4. Click **"Properties"**
5. Go to **"Connection"** tab
6. Look at the **"Username"** field - this is your actual username!

### Step 2: Update Your .env File

Based on what you see in pgAdmin, update your `.env`:

#### If username is `postgres`:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/erp?schema=public"
```

#### If username is something else (like `uuyxn`):
```env
DATABASE_URL="postgresql://uuyxn:YOUR_PASSWORD@localhost:5432/erp?schema=public"
```

### Step 3: Find or Reset Your Password

#### Option A: Check if pgAdmin Saved Your Password

1. In pgAdmin, when you expand **"PostgreSQL 17"**, does it ask for a password?
2. If NO - pgAdmin has it saved
3. If YES - that's the password you need to use

#### Option B: Reset the Password (Easiest)

1. **Open pgAdmin 4**
2. **Right-click** on **"PostgreSQL 17"**
3. Click **"PSQL Tool"** (this opens a terminal)
4. Run this command (replace `your_new_password` with a password you'll remember):

```sql
ALTER USER postgres WITH PASSWORD 'your_new_password';
```

5. Press Enter
6. You should see: `ALTER ROLE`

Now update your `.env`:
```env
DATABASE_URL="postgresql://postgres:your_new_password@localhost:5432/erp?schema=public"
```

## 🎯 Quick Test

After updating `.env`, test it:

```bash
npx prisma migrate dev --name init
```

If it works, you'll see: ✔ Migration applied successfully

## 🆘 Still Not Working?

### Try This Alternative Method

Create a new PostgreSQL user that doesn't need a password:

1. Open pgAdmin **PSQL Tool**
2. Run these commands:

```sql
-- Create a new user
CREATE USER erp_user WITH PASSWORD 'erp123';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE erp TO erp_user;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO erp_user;
```

3. Update your `.env`:
```env
DATABASE_URL="postgresql://erp_user:erp123@localhost:5432/erp?schema=public"
```

## 📝 Common pgAdmin Usernames

- `postgres` (most common)
- Your macOS username (`uuyxn`)
- `admin`
- Custom username you created

Check the **"Connection"** tab in pgAdmin Properties to see which one you're using!
