"""Quick script to remove emojis that cause Windows encoding issues"""
import os

files = [
    'ingest_historical_data.py',
    'feature_engineering.py',
    'train_models.py'
]

replacements = {
    '✅': '[OK]',
    '⚠️': '[WARNING]',
    '❌': '[ERROR]',
    '💾': '[SAVED]',
    '📊': '[STATS]',
    '🔧': '[BUILD]',
    '🎯': '[TARGET]',
    '🤖': '[MODEL]',
    '🎉': '[SUCCESS]',
}

for filename in files:
    if not os.path.exists(filename):
        continue

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    for emoji, replacement in replacements.items():
        content = content.replace(emoji, replacement)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Fixed {filename}")

print("Done!")
