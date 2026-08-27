#!/bin/bash

# Complete ERP Setup Script
# This will install everything you need and set up the database

set -e

echo "🚀 Complete ERP System Setup"
echo "=============================="
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed"
    echo "📦 Install it from: https://brew.sh"
    exit 1
fi

echo "✅ Homebrew is installed"

# Install PostgreSQL if not installed
if ! command -v psql &> /dev/null; then
    echo "📦 Installing PostgreSQL..."
    brew install postgresql@17
    echo "✅ PostgreSQL installed"
else
    echo "✅ PostgreSQL is already installed"
fi

# Start PostgreSQL
echo "🔄 Starting PostgreSQL..."
brew services start postgresql@17
sleep 3
echo "✅ PostgreSQL is running"

# Create database if it doesn't exist
echo "📦 Creating database..."
if psql -lqt | cut -d \| -f 1 | grep -qw erp_v2; then
    echo "✅ Database 'erp_v2' already exists"
else
    createdb erp_v2
    echo "✅ Database 'erp_v2' created"
fi

# Create .env file
echo "📝 Creating .env file..."
session_secret="$(openssl rand -hex 32)"
cat > .env << EOF
# Database
DATABASE_URL="postgresql://uuyxn@localhost:5432/erp_v2?schema=public"

# Local application session signing
ERP_SESSION_SECRET="${session_secret}"
AUTH_SELF_SIGNUP_ENABLED="false"
EOF
echo "✅ .env file created"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm ci

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Ask about seeding
echo ""
read -p "🌱 Do you want to add sample data? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npm run db:seed
    echo "✅ Sample data added"
fi

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Your DATABASE_URL is:"
echo "  postgresql://uuyxn@localhost:5432/erp_v2?schema=public"
echo ""
echo "Next steps:"
echo "  1. Run: npm run dev"
echo "  2. Visit: http://localhost:3000"
echo "  3. View data: npm run db:studio"
echo ""
echo "Happy coding! 🚀"
