# Finding Your PostgreSQL Connection Info 🐘

Since you already have PostgreSQL installed (the elephant app), let's find your connection details!

## 🔍 Common PostgreSQL GUI Apps

The elephant logo app is likely one of these:
- **Postgres.app** - Popular macOS app
- **pgAdmin** - PostgreSQL management tool
- **Postico** - macOS PostgreSQL client

## 📋 Finding Your Connection Details

### Method 1: Check Your PostgreSQL App

Open your PostgreSQL app (the elephant one) and look for:
- **Host**: Usually `localhost` or `127.0.0.1`
- **Port**: Usually `5432` (default)
- **Username**: Often your macOS username or `postgres`
- **Password**: You may have set this during setup
- **Database**: You'll need to create `erp_v2`

### Method 2: Try Common Configurations

Try these DATABASE_URL formats in order:

#### Option 1: No password (most common for local)
```env
DATABASE_URL="postgresql://localhost:5432/erp_v2?schema=public"
```

#### Option 2: With your macOS username
```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"
```

#### Option 3: Using 'postgres' user (common default)
```env
DATABASE_URL="postgresql://postgres@localhost:5432/erp_v2?schema=public"
```

#### Option 4: With password
```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/erp_v2?schema=public"
```

## 🎯 Quick Test

Let's test which one works:

### Step 1: Create the database

Open your PostgreSQL app and:
1. Look for a "Create Database" or "New Database" button
2. Create a database named: `erp_v2`

Or use the command line (if available):
```bash
createdb erp_v2
```

### Step 2: Create .env file

```bash
cp .env.example .env
```

### Step 3: Try each DATABASE_URL

Edit `.env` and try each option above, then test:

```bash
# Install dependencies first
npm install

# Test the connection
npx prisma db pull
```

If it works, you'll see: "Introspecting based on your database..."
If it fails, try the next DATABASE_URL option.

## 🔧 For Postgres.app Users

If you're using **Postgres.app** (common on macOS):

1. Open Postgres.app
2. Click on a server (usually shows "PostgreSQL 15" or similar)
3. It will show connection info like:
   - Host: `localhost`
   - Port: `5432`
   - User: Your macOS username
   - Database: `postgres` (default)

Your DATABASE_URL would be:
```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"
```

## 🎨 For pgAdmin Users

If you're using **pgAdmin**:

1. Open pgAdmin
2. Look at your server connection
3. Right-click server → Properties
4. Check the "Connection" tab for:
   - Host
   - Port
   - Username
   - Database

## ✅ Once You Find the Right URL

1. Update `.env` with your DATABASE_URL
2. Run migrations:
   ```bash
   npx prisma migrate dev --name init
   ```
3. Seed data (optional):
   ```bash
   npm run db:seed
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

## 🆘 Still Having Trouble?

Try this diagnostic:

```bash
# Check if PostgreSQL is running
lsof -i :5432

# This should show PostgreSQL listening on port 5432
```

Or share:
- What's the name of your elephant app?
- Can you see any connection settings in the app?
- Do you remember setting a password?

I can help you figure out the exact DATABASE_URL! 🚀
