#!/bin/bash

# Create placeholder images with colors
cd static/images

# Function to create a colored placeholder
create_placeholder() {
    local filename=$1
    local text=$2
    local color=$3
    
    # Create a simple SVG file
    cat > "${filename%.jpg}.svg" << SVGEOF
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="$color"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
        fill="white" text-anchor="middle" dominant-baseline="middle">$text</text>
</svg>
SVGEOF
    
    # Convert SVG to JPG using any available tool
    if command -v convert &> /dev/null; then
        convert "${filename%.jpg}.svg" "$filename"
        rm "${filename%.jpg}.svg"
    else
        # Just keep the SVG and rename
        mv "${filename%.jpg}.svg" "$filename"
    fi
}

# Create all placeholder images
create_placeholder "prague-charles-bridge.jpg" "Prague - Charles Bridge" "#2c5aa0"
create_placeholder "prague-castle.jpg" "Prague Castle" "#f4a261"
create_placeholder "prague-old-town.jpg" "Prague Old Town" "#e76f51"
create_placeholder "prague-tesla-charging.jpg" "Tesla Charging" "#264653"
create_placeholder "prague-food.jpg" "Prague Food" "#2a9d8f"
create_placeholder "vienna-st-stephens.jpg" "Vienna Cathedral" "#3b82f6"
create_placeholder "vienna-opera-house.jpg" "Vienna Opera" "#8b5cf6"
create_placeholder "vienna-coffee-house.jpg" "Vienna Coffee" "#ec4899"
create_placeholder "vienna-schonbrunn.jpg" "Schönbrunn Palace" "#10b981"
create_placeholder "vienna-tesla-parking.jpg" "Vienna Tesla" "#f59e0b"
create_placeholder "salzburg-fortress.jpg" "Salzburg Fortress" "#ef4444"
create_placeholder "salzburg-mozart-house.jpg" "Mozart's House" "#06b6d4"
create_placeholder "salzburg-alpine-view.jpg" "Alpine View" "#84cc16"
create_placeholder "salzburg-old-town.jpg" "Salzburg Old Town" "#a855f7"
create_placeholder "salzburg-tesla-mountains.jpg" "Tesla in Alps" "#14b8a6"

echo "✅ Created all placeholder images!"
ls -lh
