#!/bin/bash

# ERP System Setup Script
# This script automates the database setup process

set -e  # Exit on error

echo "🚀 ERP System Setup"
echo "===================="
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed"
    echo "📦 Install it with: brew install postgresql@15"
    exit 1
fi

echo "✅ PostgreSQL is installed"

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo "⚠️  PostgreSQL is not running"
    echo "🔄 Starting PostgreSQL..."
    brew services start postgresql@15 || {
        echo "❌ Failed to start PostgreSQL"
        echo "Try manually: brew services start postgresql@15"
        exit 1
    }
    sleep 2
fi

echo "✅ PostgreSQL is running"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo "⚠️  Please update DATABASE_URL in .env if needed"
else
    echo "✅ .env file exists"
fi

# Check if database exists
DB_EXISTS=$(psql -lqt | cut -d \| -f 1 | grep -w erp_v2 | wc -l)

if [ $DB_EXISTS -eq 0 ]; then
    echo "📦 Creating database 'erp_v2'..."
    createdb erp_v2 || {
        echo "❌ Failed to create database"
        echo "Try manually: createdb erp_v2"
        exit 1
    }
    echo "✅ Database created"
else
    echo "✅ Database 'erp_v2' already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate dev --name init

# Ask if user wants to seed data
echo ""
read -p "🌱 Do you want to seed sample data? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npm run db:seed
    echo "✅ Sample data added"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run: npm run dev"
echo "  2. Visit: http://localhost:3000"
echo "  3. Or view data: npm run db:studio"
echo ""
