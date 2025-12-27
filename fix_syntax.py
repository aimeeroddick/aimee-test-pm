with open('/Users/aimeeroddick/Desktop/Trackli/src/components/KanbanBoard.jsx', 'r') as f:
    content = f.read()

# Fix the missing newline
content = content.replace(')}// Progress Ring Component', ')}\n\n// Progress Ring Component')

with open('/Users/aimeeroddick/Desktop/Trackli/src/components/KanbanBoard.jsx', 'w') as f:
    f.write(content)

print('Fixed')
