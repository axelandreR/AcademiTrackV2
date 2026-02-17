
path = r'd:\AcademyTrack\AcademiTrackVS\AcademiTrackV2\components\ValidationPanel.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if '// ELIMINAR SIGUIENTES LÍNEAS' in line or 'if (false) {' in line:
        skip = True
        continue
    if skip:
        # Buscamos el final del bloque que pusimos temporalmente
        # El bloque termina en la llave de cierre de perfectMatch else plus some lines
        # Pero podemos buscar la llave de cierre que precede a '});' (final de sysRefs loop)
        if line.strip() == '}' and '});' in lines[lines.index(line)+1]:
            skip = False
            # No agregamos esta llave porque es la del 'else' que ya cerramos arriba si lo hicimos bien
            # O mejor, borramos hasta encontrar la siguiente sección B.
            continue
    if not skip:
        new_lines.append(line)

# Fallback: Si el script anterior es ambiguo, usemos anclas seguras
# Vamos a buscar la sección B y borrar todo lo que huela a duplicado antes.

final_lines = []
found_b = False
for line in lines:
    if '// B. Barrido App' in line:
        found_b = True
    
    if not found_b:
        # Si estamos antes de B, pero después de mi nueva lógica, filtramos
        if '// ELIMINAR SIGUIENTES LÍNEAS' in line:
            continue
        # (Aquí hay riesgo de borrar de más si no soy cuidadoso)
    
# Mejor: Volvamos a lo básico. Sobrescribir el archivo con el contenido correcto es lo más sano.
# Pero como es muy largo, voy a usar un script que use marcadores que yo mismo inserté.

output = []
in_dead_zone = False
for line in lines:
    if '// ELIMINAR SIGUIENTES LÍNEAS' in line:
        in_dead_zone = True
    if in_dead_zone:
        if 'results.push({' in line and 'id: `match-' in line: # Ancla de la lógica vieja
            continue
        if '});' in line and '// B. Barrido' in lines[lines.index(line)+2]: # Cierre final del forEach
            in_dead_zone = False
            output.append('            }\n')
            output.append('        });\n')
            continue
        continue
    output.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(output)
