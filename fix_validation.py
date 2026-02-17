
import os

path = r'd:\AcademyTrack\AcademiTrackVS\AcademiTrackV2\components\ValidationPanel.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_logic = [
    '                const sysStartMonday = getWeekMonday(sys.fecha_inicio);\n',
    '                const sysEndMonday = getWeekMonday(sys.fecha_fin);\n',
    '\n',
    '                // --- NUEVO ENFOQUE: MATRIZ DE SATISFACCIÓN ---\n',
    '                const perfectMatch = appMatches.find(cand => {\n',
    '                    const cStart = getWeekMonday(cand.startDate);\n',
    '                    const cEnd = getWeekMonday(cand.endDate);\n',
    '                    const datesOk = (cStart <= sysStartMonday && cEnd >= sysEndMonday);\n',
    '                    const roomOk = (cleanId(sys.edificio) === cleanId(cand.building) && cleanId(sys.salon) === cleanId(cand.room));\n',
    '                    const instOk = (cleanId(sys.instructor_id) === cleanId(cand.instructorId));\n',
    '                    return datesOk && roomOk && instOk;\n',
    '                });\n',
    '\n',
    '                if (perfectMatch) {\n',
    '                    results.push({\n',
    '                        id: `res-ok-${sys.nrc}-${sys.dia}-${sys.hora_inicio}-${perfectMatch.id}`,\n',
    '                        nrc: sys.nrc,\n',
    '                        courseName: sys.curso_nombre,\n',
    '                        instructorName: sys.instructor_nombre,\n',
    '                        status: "ok",\n',
    '                        appData: perfectMatch,\n',
    '                        sysData: sys\n',
    '                    });\n',
    '                } else {\n',
    '                    let bestCandidate = appMatches[0];\n',
    '                    const contencion = appMatches.find(c => getWeekMonday(c.startDate) <= sysStartMonday && getWeekMonday(c.endDate) >= sysEndMonday);\n',
    '                    const solapamiento = appMatches.find(c => getWeekMonday(c.startDate) <= sysEndMonday && getWeekMonday(c.endDate) >= sysStartMonday);\n',
    '                    if (contencion) bestCandidate = contencion;\n',
    '                    else if (solapamiento) bestCandidate = solapamiento;\n',
    '\n',
    '                    const d: string[] = [];\n',
    '                    const dStart = getWeekMonday(bestCandidate.startDate);\n',
    '                    const dEnd = getWeekMonday(bestCandidate.endDate);\n',
    '                    if (dStart > sysStartMonday) d.push(`Inicio Tardío: Sistema ${sysStartMonday}, App ${dStart}`);\n',
    '                    if (dEnd < sysEndMonday) d.push(`Fin Prematuro: Sistema ${sysEndMonday}, App ${dEnd}`);\n',
    '                    if (cleanId(sys.instructor_id) !== cleanId(bestCandidate.instructorId)) {\n',
    '                        if (isPlaceholder(bestCandidate.instructorId) && !isPlaceholder(sys.instructor_id)) d.push("ACTUALIZACIÓN: App tiene placeholder.");\n',
    '                        else d.push(`Instructor: Sistema (${sys.instructor_nombre}) vs App (${bestCandidate.instructor})`);\n',
    '                    }\n',
    '                    const sRoom = norm(sys.edificio) + "-" + norm(sys.salon);\n',
    '                    const aRoom = norm(bestCandidate.building) + "-" + norm(bestCandidate.room);\n',
    '                    if (sRoom !== aRoom) d.push(`Aula: Sistema (${sRoom}) vs App (${aRoom})`);\n',
    '\n',
    '                    results.push({\n',
    '                        id: `res-disc-${sys.nrc}-${sys.dia}-${sys.hora_inicio}-${bestCandidate.id}`,\n',
    '                        nrc: sys.nrc,\n',
    '                        courseName: sys.curso_nombre,\n',
    '                        instructorName: sys.instructor_nombre,\n',
    '                        status: "discrepancy",\n',
    '                        details: d,\n',
    '                        appData: bestCandidate,\n',
    '                        sysData: sys\n',
    '                    });\n',
    '                }\n'
]

# Sustituyendo desde línea 143 (index 142) hasta 226 (index 225)
# En el archivo actual (según view_file):
# 142:             } else {
# 143:                 // Iniciando Búsqueda...
# ...
# 226:             }

lines[142:226] = new_logic

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
