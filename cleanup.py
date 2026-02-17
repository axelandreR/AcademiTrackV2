
path = r'd:\AcademyTrack\AcademiTrackVS\AcademiTrackV2\components\ValidationPanel.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Borrar desde línea 199 (índice 198) hasta 284 (índice 283)
del lines[198:284]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
