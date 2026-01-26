
import ExcelJS from 'exceljs';
import { ProcessedSchedule, ViewType, InstructorData, HolidayData } from '../types';
import { getTimeSlots, DAYS_OF_WEEK, getHexColor } from '../constants';

interface ExcelExportParams {
  data: ProcessedSchedule[];
  type: ViewType;
  itemName: string;
  scope: 'firstWeek' | 'allWeeks' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  instructorInfo?: InstructorData;
  logo?: string;
  holidays?: HolidayData[];
}

const SEMESTER_END_LIMIT = new Date(2026, 5, 28); // 28/06/2026

const timeToMin = (t: string) => {
  if (!t) return -1;
  const parts = t.split(':');
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
};

const findClosestSlotIdx = (timeStr: string, timeSlots: any[]): number => {
  const targetMin = timeToMin(timeStr);
  if (targetMin === -1) return -1;
  let closestIdx = -1;
  let minDiff = Infinity;
  timeSlots.forEach((slot, idx) => {
    const slotMin = timeToMin(slot.label);
    const diff = Math.abs(slotMin - targetMin);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  return minDiff < 15 ? closestIdx : -1;
};

export const generateScheduleExcel = async ({ data, type, itemName, scope, customStartDate, customEndDate, instructorInfo, logo, holidays = [] }: ExcelExportParams): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Horario');
  const allTimeSlots = getTimeSlots();

  const latestMinutes = data.reduce((max, s) => Math.max(max, timeToMin(s.endTime)), 0);
  const clipLimitMinutes = latestMinutes > 0 ? Math.min(timeToMin("23:15"), latestMinutes + 60) : timeToMin("22:30");
  const timeSlots = allTimeSlots.filter(slot => timeToMin(slot.label) <= clipLimitMinutes);
  
  const allDates = data.map(d => d.startDate.getTime()).concat(data.map(d => d.endDate.getTime()));
  let startLimit: Date;
  let endLimit: Date;

  if (scope === 'custom' && customStartDate && customEndDate) {
    startLimit = new Date(customStartDate + 'T00:00:00');
    endLimit = new Date(customEndDate + 'T23:59:59');
  } else if (allDates.length > 0) {
    startLimit = new Date(Math.min(...allDates));
    endLimit = new Date(Math.min(Math.max(...allDates), SEMESTER_END_LIMIT.getTime()));
  } else {
    startLimit = new Date();
    endLimit = new Date(SEMESTER_END_LIMIT);
  }

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0,0,0,0);
    return date;
  };

  const isHolidayDate = (date: Date) => {
    return holidays.find(h => 
      h.date.getDate() === date.getDate() && 
      h.date.getMonth() === date.getMonth() && 
      h.date.getFullYear() === date.getFullYear()
    );
  };

  const startDate = getStartOfWeek(startLimit);
  const totalWeeks = scope === 'firstWeek' ? 1 : Math.ceil((endLimit.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) || 1;
  
  const firstItem = data[0];

  // Configuración de anchos de columna
  for (let w = 0; w < totalWeeks; w++) {
    const colOffset = w * 9;
    worksheet.getColumn(colOffset + 1).width = 8; // INICIO
    worksheet.getColumn(colOffset + 2).width = 8; // FIN
    // Columnas de días de la semana (LUN-DOM) a 17.3
    for (let d = 0; d < 7; d++) {
      worksheet.getColumn(colOffset + 3 + d).width = 17.3;
    }
  }

  if (logo && logo.includes('base64')) {
    try {
      const imageId = workbook.addImage({ base64: logo, extension: 'png' });
      worksheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 100 } });
    } catch (e) { console.warn('Logo error', e); }
  }

  const infoStartRow = 6;
  if (type === 'Instructor') {
    worksheet.getCell(`B${infoStartRow}`).value = 'ID:';
    worksheet.getCell(`C${infoStartRow}`).value = instructorInfo?.id || firstItem?.instructorId || 'N/A';
    worksheet.getCell(`D${infoStartRow}`).value = 'INSTRUCTOR:';
    worksheet.getCell(`E${infoStartRow}`).value = itemName;
    worksheet.getCell(`G${infoStartRow}`).value = 'HORARIO ' + (firstItem?.periodo || '') + ' CFP';
    
    worksheet.getCell(`B${infoStartRow + 1}`).value = 'PERIODO:';
    worksheet.getCell(`C${infoStartRow + 1}`).value = firstItem?.periodo || 'N/A';
    worksheet.getCell(`D${infoStartRow + 1}`).value = 'INICIO GRAL:';
    worksheet.getCell(`E${infoStartRow + 1}`).value = startLimit.toLocaleDateString('es-ES');
    worksheet.getCell(`G${infoStartRow + 1}`).value = 'FIN GRAL:';
    worksheet.getCell(`H${infoStartRow + 1}`).value = endLimit.toLocaleDateString('es-ES');

    [`B${infoStartRow}`, `D${infoStartRow}`, `G${infoStartRow}`, `B${infoStartRow + 1}`, `D${infoStartRow + 1}`, `G${infoStartRow + 1}`].forEach(ref => {
      const cell = worksheet.getCell(ref);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });
  } else {
    if (type === 'Bloque') {
      worksheet.getCell(`A${infoStartRow}`).value = 'BLOQUE:'; worksheet.getCell(`B${infoStartRow}`).value = itemName;
      worksheet.getCell(`C${infoStartRow}`).value = 'CARRERA:'; worksheet.getCell(`D${infoStartRow}`).value = firstItem?.career || 'N/A';
    } else {
      worksheet.getCell(`A${infoStartRow}`).value = 'AULA:'; worksheet.getCell(`B${infoStartRow}`).value = itemName;
    }
  }

  const headerStartRow = 10;
  const weekRowValues: string[] = [];
  const dateRowValues: string[] = [];
  const dayRowValues: string[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + (w * 7));
    weekRowValues.push(`SEMANA ${w + 1}`, '', '', '', '', '', '', '', '');
    dateRowValues.push('', ''); 
    for(let i=0; i<7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        dateRowValues.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    }
    dayRowValues.push('INICIO', 'FIN', ...DAYS_OF_WEEK.map(d => d.label.toUpperCase()));
  }

  const weekRow = worksheet.getRow(headerStartRow); weekRow.values = weekRowValues;
  const dateRow = worksheet.getRow(headerStartRow + 1); dateRow.values = dateRowValues;
  const dayRow = worksheet.getRow(headerStartRow + 2); dayRow.values = dayRowValues;

  const formatHeader = (row: ExcelJS.Row) => {
    row.eachCell({ includeEmpty: false }, cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  };

  [weekRow, dateRow, dayRow].forEach(formatHeader);

  for (let w = 0; w < totalWeeks; w++) {
    const colStart = w * 9 + 1;
    worksheet.mergeCells(headerStartRow, colStart, headerStartRow, colStart + 8);
  }

  const startGridRow = headerStartRow + 3;
  timeSlots.forEach((slot, sIdx) => {
    const nextSlot = timeSlots[sIdx + 1];
    const rowNum = startGridRow + sIdx;
    const row = worksheet.getRow(rowNum);
    const rowValues: string[] = [];
    for (let w = 0; w < totalWeeks; w++) {
      rowValues.push(slot.label);
      rowValues.push(nextSlot ? nextSlot.label : '');
      for (let d = 0; d < 7; d++) rowValues.push('');
    }
    row.values = rowValues;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      const colInGroup = colNumber % 9;
      if (colInGroup === 1 || colInGroup === 2) {
          cell.font = { size: 8, color: { argb: 'FF000000' }, bold: true };
      }
    });
  });

  const weeklySummaries: { sync: number, async: number, pc: number, coord: number, other: number }[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + (w * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const colOffset = w * 9;
    let wSync = 0, wAsync = 0, wPC = 0, wCoord = 0, wOther = 0;

    for (let d = 0; d < 7; d++) {
      const actualDate = new Date(weekStart);
      actualDate.setDate(weekStart.getDate() + d);
      const holiday = isHolidayDate(actualDate);
      if (holiday) {
        const colIndex = colOffset + 3 + d;
        const startSlotIdx = findClosestSlotIdx("07:45", timeSlots);
        const endSlotIdx = findClosestSlotIdx("17:42", timeSlots) - 1;
        if (startSlotIdx !== -1 && endSlotIdx >= startSlotIdx) {
          const excelStartRow = startGridRow + startSlotIdx;
          const excelEndRow = startGridRow + endSlotIdx;
          const cell = worksheet.getCell(excelStartRow, colIndex);
          cell.value = `FERIADO NO LABORABLE\n${holiday.name.toUpperCase()}\n07:45 - 17:42`;
          if (excelEndRow > excelStartRow) worksheet.mergeCells(excelStartRow, colIndex, excelEndRow, colIndex);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { size: 7, bold: true, color: { argb: 'FF991B1B' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        }
      }
    }

    data.forEach(sched => {
      if (sched.startDate <= weekEnd && sched.endDate >= weekStart) {
        sched.days.forEach(dayKey => {
          const dIdx = DAYS_OF_WEEK.findIndex(d => d.key === dayKey);
          if (dIdx === -1) return;
          const actualDate = new Date(weekStart);
          actualDate.setDate(weekStart.getDate() + dIdx);
          if (actualDate < sched.startDate || actualDate > sched.endDate) return;
          if (sched.isAdministrative && isHolidayDate(actualDate)) return;

          const colIndex = colOffset + 3 + dIdx;
          const startSlotIdx = findClosestSlotIdx(sched.startTime, timeSlots);
          const endSlotIdx = findClosestSlotIdx(sched.endTime, timeSlots) - 1;

          if (startSlotIdx !== -1 && endSlotIdx >= startSlotIdx) {
            const excelStartRow = startGridRow + startSlotIdx;
            const excelEndRow = startGridRow + endSlotIdx;
            const cell = worksheet.getCell(excelStartRow, colIndex);
            
            if (sched.isAdministrative) {
              let taskName = sched.category === 'refrigerio' ? 'REFRIGERIO' : (sched.category === 'preparacion' ? 'PREPARACIÓN DE CLASE' : (sched.category === 'asincrona' ? 'ASÍNCRONA' : (sched.category === 'por_asignar' ? 'HORAS POR ASIGNAR' : sched.courseName)));
              cell.value = `${taskName} ${sched.modality?.toUpperCase() || ''}\n${sched.startTime} - ${sched.endTime}`;
            } else {
              const instructorLine = type === 'Instructor' ? '' : `Docente: ${sched.instructor}\n`;
              cell.value = `${sched.nrc} - ${sched.block}\n${sched.courseName}\n${sched.activity}\n${instructorLine}${sched.building}-${sched.room}\n${sched.startTime}-${sched.endTime}`;
            }
            
            if (excelEndRow > excelStartRow) worksheet.mergeCells(excelStartRow, colIndex, excelEndRow, colIndex);

            let hexColor = getHexColor(sched.color);
            const isAutoestudio = sched.meetingType === 'VAEE' || (sched.activity && sched.activity.toUpperCase().includes('AUTOESTUDIO'));

            if (sched.category === 'asincrona') hexColor = 'E4F4DD';
            else if (sched.category === 'preparacion') hexColor = sched.modality === 'presencial' ? 'EABC2D' : 'FFFA48';
            else if (sched.category === 'refrigerio') hexColor = 'FFEDD5';
            else if (sched.category === 'por_asignar') hexColor = 'F5F3FF';
            else if (!sched.isAdministrative) hexColor = isAutoestudio ? 'E2E8F0' : 'D9FFFF';

            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hexColor } };
            cell.font = { size: 7, bold: true, color: { argb: 'FF000000' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

            const duration = (timeToMin(sched.endTime) - timeToMin(sched.startTime)) / 60;
            if (sched.category === 'asincrona') wAsync += duration;
            else if (sched.category === 'preparacion') wPC += duration;
            else if (sched.category === 'coordinador') wCoord += duration;
            else if (sched.category === 'por_asignar') wOther += duration;
            else if (sched.category !== 'refrigerio') wSync += duration;
          }
        });
      }
    });
    weeklySummaries.push({ sync: wSync, async: wAsync, pc: wPC, coord: wCoord, other: wOther });
  }

  if (type === 'Instructor') {
    const summaryStartRow = startGridRow + timeSlots.length + 2;
    for (let w = 0; w < totalWeeks; w++) {
      const colOffset = w * 9;
      const s = weeklySummaries[w];
      const rows = [
        ['HORAS SINCRONAS', `${Math.floor(s.sync)}h:${String(Math.round((s.sync % 1) * 60)).padStart(2, '0')}m`],
        ['HORAS ASINCRONAS', `${Math.floor(s.async)}h:${String(Math.round((s.async % 1) * 60)).padStart(2, '0')}m`],
        ['PC', `${Math.floor(s.pc)}h:${String(Math.round((s.pc % 1) * 60)).padStart(2, '0')}m`],
        ['COORDINACIÓN/OTROS', `${Math.floor(s.coord + s.other)}h:${String(Math.round(((s.coord + s.other) % 1) * 60)).padStart(2, '0')}m`],
        ['TOTAL SEMANA', `${Math.floor(s.sync + s.async + s.pc + s.coord + s.other)}h:${String(Math.round(((s.sync + s.async + s.pc + s.coord + s.other) % 1) * 60)).padStart(2, '0')}m`]
      ];
      rows.forEach((r, idx) => {
        const rowNum = summaryStartRow + idx;
        const cellLabel = worksheet.getCell(rowNum, colOffset + 4);
        const cellValue = worksheet.getCell(rowNum, colOffset + 5);
        cellLabel.value = r[0]; cellValue.value = r[1];
        cellLabel.font = { bold: true, size: 8 }; cellValue.font = { size: 8 };
        if (idx === 4) cellLabel.font = { bold: true, size: 9 };
      });
    }

    // AÑADIR RESUMEN DE CARGA ACADÉMICA (Solo cursos académicos)
    const academicSummaryRow = summaryStartRow + 8;
    worksheet.mergeCells(academicSummaryRow, 1, academicSummaryRow, 8);
    const mainTitleCell = worksheet.getCell(academicSummaryRow, 1);
    mainTitleCell.value = 'RESUMEN DE CARGA ACADÉMICA (CURSOS ASIGNADOS)';
    mainTitleCell.font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
    mainTitleCell.alignment = { horizontal: 'center' };
    
    const tableHeaderRow = academicSummaryRow + 2;
    const headers = ['NRC', 'BLOQUE', 'CURSO', 'ACTIVIDAD', 'AULA', 'INICIO', 'FIN'];
    const columnWidths = [10, 15, 40, 15, 15, 12, 12];
    
    headers.forEach((h, idx) => {
      const cell = worksheet.getCell(tableHeaderRow, idx + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      worksheet.getColumn(idx + 1).width = columnWidths[idx];
    });

    const academicSchedules = data.filter(s => !s.isAdministrative);
    // Agrupar sesiones por NRC y bloque para evitar duplicidad de "filas de curso" si el curso tiene varias sesiones en la semana
    // Pero respetando que un NRC puede tener múltiples bloques o edificios si fuera el caso
    const uniqueAcademicLines = Array.from(new Set(academicSchedules.map(s => `${s.nrc}|${s.block}|${s.courseName}|${s.activity}|${s.building}-${s.room}|${s.startDate.getTime()}|${s.endDate.getTime()}`)));

    let currentItemRow = tableHeaderRow + 1;
    
    uniqueAcademicLines.forEach((line) => {
      const [nrc, block, course, activity, room, startT, endT] = line.split('|');
      const row = worksheet.getRow(currentItemRow);
      row.getCell(1).value = nrc;
      row.getCell(2).value = block;
      row.getCell(3).value = course;
      row.getCell(4).value = activity;
      row.getCell(5).value = room;
      row.getCell(6).value = new Date(Number(startT)).toLocaleDateString('es-ES');
      row.getCell(7).value = new Date(Number(endT)).toLocaleDateString('es-ES');
      
      for(let i=1; i<=7; i++) {
        const cell = row.getCell(i);
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: i === 3 ? 'left' : 'center', vertical: 'middle' };
        cell.font = { size: 9 };
      }
      currentItemRow++;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const generateGlobalAuditExcel = async (instructors: InstructorData[], schedules: ProcessedSchedule[], holidays: HolidayData[]): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Auditoría Global');

  if (schedules.length === 0) return new Blob();

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0,0,0,0);
    return date;
  };

  const starts = schedules.map(s => s.startDate.getTime());
  const ends = schedules.map(s => s.endDate.getTime());
  const globalStart = getStartOfWeek(new Date(Math.min(...starts)));
  const globalEnd = new Date(Math.min(Math.max(...ends), SEMESTER_END_LIMIT.getTime()));

  const weeks: { start: Date, end: Date }[] = [];
  let scanner = new Date(globalStart);
  while (scanner <= globalEnd) {
    const wEnd = new Date(scanner);
    wEnd.setDate(scanner.getDate() + 6);
    weeks.push({ start: new Date(scanner), end: wEnd });
    scanner.setDate(scanner.getDate() + 7);
  }

  const headerRow1 = worksheet.getRow(1);
  const headerRow2 = worksheet.getRow(2);
  headerRow1.values = ['ID', 'TRABAJADOR', 'TIPO', 'ESPECIALIDAD', ...weeks.flatMap(w => [`SEMANA ${w.start.toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'})}`, ''])];
  headerRow2.values = ['', '', '', '', ...weeks.flatMap(() => ['ARCHIVO', 'REAL'])];

  for (let i = 0; i < weeks.length; i++) {
    const col = 5 + (i * 2);
    worksheet.mergeCells(1, col, 1, col + 1);
  }

  [headerRow1, headerRow2].forEach(row => {
    row.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  instructors.forEach((inst) => {
    const rowValues: (string | number)[] = [inst.id, inst.name, inst.type, inst.specialty];
    const instSchedules = schedules.filter(s => s.instructor === inst.name);
    const instAcademic = instSchedules.filter(s => !s.isAdministrative);

    weeks.forEach(w => {
      let wMeta = 0, wReal = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(w.start); d.setDate(w.start.getDate() + i);
        if (d > SEMESTER_END_LIMIT) continue;

        const dName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][d.getDay()];
        const hol = holidays.find(h => h.date.toDateString() === d.toDateString());
        const fileSess = instAcademic.filter(s => s.days.includes(dName) && d >= s.startDate && d <= s.endDate);
        fileSess.forEach(s => wMeta += s.weeklyHours);
        if (hol && inst.type === 'TP') {
          const lostMin = fileSess.reduce((acc, s) => acc + (timeToMin(s.endTime) - timeToMin(s.startTime)), 0);
          wMeta -= (lostMin / 60);
        }
        instSchedules.filter(s => s.days.includes(dName) && d >= s.startDate && d <= s.endDate).forEach(s => {
          const dur = (timeToMin(s.endTime) - timeToMin(s.startTime)) / 60;
          const isAuto = s.meetingType === 'VAEE' || (s.activity && s.activity.toUpperCase().includes('AUTOESTUDIO')) || s.category === 'asincrona';
          if (!s.isAdministrative) { if (!hol) wReal += dur; }
          else if (!hol && (isAuto || s.category === 'asincrona' || s.category === 'preparacion' || s.category === 'coordinador')) wReal += dur;
        });
      }
      rowValues.push(Number(wMeta.toFixed(2)), Number(wReal.toFixed(2)));
    });

    const row = worksheet.addRow(rowValues);
    row.eachCell((c, colNum) => {
      c.border = { bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (colNum >= 5 && colNum % 2 === 0) {
        const metaCol = colNum - 1;
        const metaVal = Number(row.getCell(metaCol).value);
        const realVal = Number(c.value);
        if (Math.abs(realVal - metaVal) > 0.01) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: realVal < metaVal ? 'FFFEE2E2' : 'FFF3F7FF' } };
          c.font = { color: { argb: realVal < metaVal ? 'FF991B1B' : 'FF1E40AF' }, bold: true };
        } else {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
          c.font = { color: { argb: 'FF065F46' } };
        }
      }
    });
  });

  worksheet.columns = [
    { width: 12 }, { width: 35 }, { width: 10 }, { width: 25 },
    ...weeks.flatMap(() => [{ width: 10 }, { width: 10 }])
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
