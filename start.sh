#!/bin/bash

# World Tour Website Startup Script

echo "🚗 Starting Cristyne & Alex World Tour Website..."
echo ""

# Check if Hugo is installed
if ! command -v hugo &> /dev/null; then
    echo "❌ Hugo is not installed!"
    echo ""
    echo "Please install Hugo first:"
    echo "  macOS: brew install hugo"
    echo "  Or download from: https://github.com/gohugoio/hugo/releases"
    echo ""
    exit 1
fi

echo "✅ Hugo is installed: $(hugo version)"
echo ""

# Create images directory if it doesn't exist
if [ ! -d "static/images" ]; then
    mkdir -p static/images
    echo "📁 Created images directory"
fi

# Add some placeholder images (you can replace these with your actual photos)
echo "📸 Adding placeholder images..."
cat > static/images/placeholder.svg << 'EOF'
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8f9fa"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="#6c757d" text-anchor="middle" dominant-baseline="middle">
    Add your travel photos here
  </text>
</svg>
EOF

echo "🌐 Starting Hugo development server..."
echo ""
echo "Your website will be available at: http://localhost:1313"
echo "Press Ctrl+C to stop the server"
echo ""

# Start Hugo server
hugo server -D --bind 0.0.0.0
