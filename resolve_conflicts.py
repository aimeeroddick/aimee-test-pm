#!/usr/bin/env python3
"""Resolve merge conflicts by keeping develop version (which has new features)"""

import re

file_path = 'src/components/KanbanBoard.jsx'

with open(file_path, 'r') as f:
    content = f.read()

# Find and resolve all merge conflicts - keep the develop version
def resolve_conflicts(text):
    # Pattern for merge conflicts
    pattern = r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> develop'
    
    def replacer(match):
        # Keep the develop version (group 2)
        return match.group(2)
    
    # Use DOTALL flag to match across lines
    return re.sub(pattern, replacer, text, flags=re.DOTALL)

resolved = resolve_conflicts(content)

# Check if conflicts were resolved
if '<<<<<<' in resolved:
    print("WARNING: Some conflicts may not be resolved")
else:
    print("✓ All merge conflicts resolved")

with open(file_path, 'w') as f:
    f.write(resolved)

print("Done!")
