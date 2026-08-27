# Finding Connection Info in pgAdmin 4 🐘

## 📍 Your Current Setup

- **Software**: pgAdmin 4
- **Server**: PostgreSQL 17
- **Database**: `erp` (already created ✅)

## 🔍 How to Find Connection Details in pgAdmin 4

### Step 1: Find Server Connection Info

1. **Open pgAdmin 4**
2. In the left sidebar, you'll see: `Servers` → `PostgreSQL 17`
3. **Right-click** on `PostgreSQL 17`
4. Select **"Properties"** from the menu
5. Click on the **"Connection"** tab

You'll see:
- **Host name/address**: Usually `localhost` or `127.0.0.1`
- **Port**: Usually `5432`
- **Maintenance database**: Usually `postgres`
- **Username**: This is your PostgreSQL username

### Step 2: Find Your Username

In the same Properties window:
- Look at the **"Connection"** tab
- The **"Username"** field shows your PostgreSQL user
- Common usernames: `postgres`, `uuyxn`, or your macOS username

### Step 3: Check if Password is Required

- If you set a password when installing PostgreSQL, you'll need it
- If you can connect to pgAdmin without entering a password each time, you might not need one in the connection string

## 🎯 Your DATABASE_URL

Based on your setup, your DATABASE_URL should be:

### Format:
```
postgresql://[username]:[password]@[host]:[port]/[database]?schema=public
```

### Most Likely Options:

#### Option 1: Using 'postgres' user (most common)
```env
DATABASE_URL="postgresql://postgres@localhost:5432/erp?schema=public"
```

#### Option 2: With password
```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/erp?schema=public"
```

#### Option 3: Using your macOS username
```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp?schema=public"
```

## ⚙️ Quick Setup Steps

### 1. Create `.env` file
```bash
cp .env.example .env
```

### 2. Edit `.env` and add your DATABASE_URL

Start with **Option 1** (no password):
```env
DATABASE_URL="postgresql://postgres@localhost:5432/erp?schema=public"
```

### 3. Install dependencies
```bash
npm install
```

### 4. Test the connection
```bash
npx prisma migrate dev --name init
```

## ✅ If It Works

You'll see:
```
✔ Generated Prisma Client
✔ The migration has been applied successfully
```

## ❌ If You Get an Error

### Error: "password authentication failed"

You need to add your password. Edit `.env`:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/erp?schema=public"
```

### Error: "role does not exist"

The username is wrong. Try:
```env
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp?schema=public"
```

### Error: "database does not exist"

Good news - you already created it! Just make sure the name matches exactly: `erp`

## 🔐 Finding Your Password (if needed)

If you need your password but forgot it:

1. **In pgAdmin 4**:
   - Right-click `PostgreSQL 17`
   - Select "Properties"
   - Go to "Connection" tab
   - If there's a saved password, you might see dots (•••)

2. **Reset password** (if needed):
   - Open pgAdmin 4
   - Right-click `PostgreSQL 17` → "PSQL Tool"
   - Run this command:
   ```sql
   ALTER USER postgres WITH PASSWORD 'new_password';
   ```
   - Then use that password in your DATABASE_URL

## 📝 Example .env File

Here's what your complete `.env` should look like:

```env
# Database
DATABASE_URL="postgresql://postgres@localhost:5432/erp?schema=public"

# Application session signing (generate with: openssl rand -hex 32)
ERP_SESSION_SECRET="replace-with-a-random-64-character-hex-value"
AUTH_SELF_SIGNUP_ENABLED="false"
```

## 🎯 Final Steps

Once you have the right DATABASE_URL:

```bash
# 1. Run migrations
npx prisma migrate dev --name init

# 2. Seed sample data (optional)
npm run db:seed

# 3. Start the app
npm run dev
```

Visit **http://localhost:3000** 🎉

## 💡 Pro Tip

In pgAdmin 4, you can also:
- Click on your `erp` database
- Go to "Dashboard" tab
- You'll see connection info at the top

## 🆘 Still Need Help?

Try this command to see what's listening on port 5432:
```bash
lsof -i :5432
```

This will confirm PostgreSQL is running and show you the connection details.
