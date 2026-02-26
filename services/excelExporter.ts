import ExcelJS from 'exceljs';
import { ProcessedSchedule, ViewType, Instructor, HolidayData } from '../types';
import { isOtherFunctionsCourse, isExcludedFromTotalLoad, isAcademicMetaLoad, isContractualLoad } from './businessRules';
import { getTimeSlots, DAYS_OF_WEEK, getHexColor, SEMESTER_START_DATE, SEMESTER_END_DATE, CONTRACT_HOURS_TC } from '../constants';

interface ExcelExportParams {
  data: ProcessedSchedule[];
  type: ViewType;
  itemName: string;
  scope: 'firstWeek' | 'allWeeks' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  instructorInfo?: Instructor;
  logo?: string;
  holidays?: HolidayData[];
  extraHoursConfig?: any;
}

const SEMESTER_LIMIT_START = SEMESTER_START_DATE;
const SEMESTER_LIMIT_END = SEMESTER_END_DATE;

const timeToMin = (t: string) => {
  if (!t) return -1;
  const parts = t.split(':');
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
};

const formatTimeLabel = (h: number) => {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh} h:${String(mm).padStart(2, '0')} m`;
};

const formatMinutesToTime = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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

const parseLocalDBDateInternal = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const generateHESummaryExcel = async (config: any, holidays: any[] = [], instructorName?: string): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Resumen HE');

  worksheet.mergeCells('A1:C1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'REPORTE DE PROGRAMACIÓN DE HORAS EXTRAS';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center' };

  let dataStartRow = 3; // Default starting row for data if no instructor name

  if (instructorName) {
    worksheet.getCell('A2').value = 'Instructor:';
    worksheet.getCell('B2').value = instructorName.toUpperCase();
    worksheet.getCell('B2').font = { bold: true };
    dataStartRow = 4; // Shift data down by one row if instructor name is present
  }

  worksheet.getCell(`A${dataStartRow}`).value = 'Periodo:';
  worksheet.getCell(`B${dataStartRow}`).value = `${config.startDate || 'No definida'} a ${config.endDate || 'No definida'}`;
  worksheet.getCell(`A${dataStartRow + 1}`).value = 'Repetición Semanal:';
  worksheet.getCell(`B${dataStartRow + 1}`).value = config.repeatWeekly ? 'SÍ' : 'NO';

  const headers = ['FECHA', 'DÍA', 'TURNO', 'INICIO', 'FIN', 'TOTAL HORAS'];
  const headerRow = worksheet.getRow(dataStartRow + 3); // Headers will be 3 rows below the 'Periodo' row
  headerRow.values = headers;
  headerRow.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: 'center' };
  });

  let currentRow = dataStartRow + 4;
  let grandTotal = 0;

  // Helper para parsear YYYY-MM-DD forzando medianoche local
  const toLocalDate = (s: string) => {
    if (!s) return null;
    const parts = s.split('-').map(Number);
    if (parts.length !== 3) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  };

  const start = toLocalDate(config.startDate);
  const end = toLocalDate(config.endDate);

  if (start && end) {
    const scanner = new Date(start);
    while (scanner <= end) {
      const dayIdx = scanner.getDay();
      const dayLabels = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
      const dayKey = dayLabels[dayIdx];
      const displayDay = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayIdx];

      // Verificar feriado comparando solo día/mes/año
      const isHol = holidays.some(h => {
        const hDate = new Date(h.date);
        return hDate.getDate() === scanner.getDate() &&
          hDate.getMonth() === scanner.getMonth() &&
          hDate.getFullYear() === scanner.getFullYear();
      });

      if (!isHol) {
        const shifts = config.shifts?.[dayKey] || {};
        ['morning', 'afternoon'].forEach(type => {
          const shift = (shifts as any)[type];
          if (shift?.start && shift?.end) {
            const h = (timeToMin(shift.end) - timeToMin(shift.start)) / 60;
            const dateStr = `${String(scanner.getDate()).padStart(2, '0')}/${String(scanner.getMonth() + 1).padStart(2, '0')}/${scanner.getFullYear()}`;
            worksheet.addRow([dateStr, displayDay, type === 'morning' ? 'MAÑANA' : 'TARDE', shift.start, shift.end, Number(h.toFixed(2))]);
            grandTotal += h;
            currentRow++;
          }
        });
      }

      scanner.setDate(scanner.getDate() + 1);
    }
  }

  const totalRow = worksheet.getRow(currentRow + 1);
  totalRow.getCell(5).value = 'TOTAL GENERAL:';
  totalRow.getCell(6).value = grandTotal.toFixed(2) + ' hrs';
  totalRow.eachCell(c => c.font = { bold: true });

  worksheet.columns = [
    { width: 12 }, { width: 12 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 15 }
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const generateScheduleExcel = async ({ data, type, itemName, scope, customStartDate, customEndDate, instructorInfo, logo, holidays = [], extraHoursConfig }: ExcelExportParams): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Horario');
  const allTimeSlots = getTimeSlots();

  const latestMinutes = data.reduce((max, s) => Math.max(max, timeToMin(s.endTime)), 0);
  const clipLimitMinutes = latestMinutes > 0 ? Math.min(timeToMin("23:15"), latestMinutes + 60) : timeToMin("22:30");
  const timeSlots = allTimeSlots.filter(slot => timeToMin(slot.label) <= clipLimitMinutes);

  // VALIDACIÓN DE FECHAS
  data.forEach(s => {
    if (isNaN(s.startDate.getTime())) throw new Error(`Fecha Inicio Inválida en curso ${s.courseCode || 'N/A'} (NRC: ${s.nrc || 'N/A'}) - ID: ${s.id}`);
    if (isNaN(s.endDate.getTime())) throw new Error(`Fecha Fin Inválida en curso ${s.courseCode || 'N/A'} (NRC: ${s.nrc || 'N/A'}) - ID: ${s.id}`);
  });

  const allDates = data.map(d => d.startDate.getTime()).concat(data.map(d => d.endDate.getTime()));
  let startLimit: Date;
  let endLimit: Date;

  if (scope === 'custom' && customStartDate && customEndDate) {
    startLimit = new Date(customStartDate + 'T00:00:00');
    endLimit = new Date(customEndDate + 'T23:59:59');
  } else if (scope === 'allWeeks') {
    startLimit = new Date(SEMESTER_LIMIT_START);
    endLimit = new Date(SEMESTER_LIMIT_END);
  } else if (allDates.length > 0) {
    const minD = Math.min(...allDates);
    const maxD = Math.max(...allDates);
    startLimit = new Date(Math.max(minD, SEMESTER_LIMIT_START.getTime()));
    endLimit = new Date(Math.min(maxD, SEMESTER_LIMIT_END.getTime()));
  } else {
    startLimit = new Date(SEMESTER_LIMIT_START);
    endLimit = new Date(SEMESTER_LIMIT_END);
  }

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
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

  // Calcular semanas de forma robusta iterando
  const weeksList: { start: Date; end: Date }[] = [];
  let scannerDate = new Date(startDate);
  const effectiveEndLimit = new Date(endLimit); // Use a new variable to avoid confusion with maxAuditDate

  if (scope === 'firstWeek') {
    const wEnd = new Date(scannerDate);
    wEnd.setDate(scannerDate.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);
    weeksList.push({ start: new Date(scannerDate), end: wEnd });
  } else {
    while (scannerDate <= effectiveEndLimit) {
      const wEnd = new Date(scannerDate);
      wEnd.setDate(scannerDate.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);
      weeksList.push({ start: new Date(scannerDate), end: wEnd });
      scannerDate.setDate(scannerDate.getDate() + 7);
    }
  }

  const totalWeeks = weeksList.length;

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
    worksheet.getCell(`B${infoStartRow} `).value = 'ID:';
    worksheet.getCell(`C${infoStartRow} `).value = instructorInfo?.id || firstItem?.instructorId || 'N/A';
    worksheet.getCell(`D${infoStartRow} `).value = 'INSTRUCTOR:';
    worksheet.getCell(`E${infoStartRow} `).value = itemName;
    worksheet.getCell(`G${infoStartRow} `).value = 'HORARIO ' + (firstItem?.periodo || '') + ' CFP';

    worksheet.getCell(`B${infoStartRow + 1} `).value = 'PERIODO:';
    worksheet.getCell(`C${infoStartRow + 1} `).value = firstItem?.periodo || 'N/A';
    worksheet.getCell(`D${infoStartRow + 1} `).value = 'INICIO GRAL:';
    worksheet.getCell(`E${infoStartRow + 1} `).value = startLimit.toLocaleDateString('es-ES');
    worksheet.getCell(`G${infoStartRow + 1} `).value = 'FIN GRAL:';
    worksheet.getCell(`H${infoStartRow + 1} `).value = endLimit.toLocaleDateString('es-ES');

    [`B${infoStartRow} `, `D${infoStartRow} `, `G${infoStartRow} `, `B${infoStartRow + 1} `, `D${infoStartRow + 1} `, `G${infoStartRow + 1} `].forEach(ref => {
      const cell = worksheet.getCell(ref);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });
  } else {
    if (type === 'Bloque') {
      worksheet.getCell(`A${infoStartRow} `).value = 'BLOQUE:'; worksheet.getCell(`B${infoStartRow} `).value = itemName;
      worksheet.getCell(`C${infoStartRow} `).value = 'CARRERA:'; worksheet.getCell(`D${infoStartRow} `).value = firstItem?.career || 'N/A';
    } else {
      worksheet.getCell(`A${infoStartRow} `).value = 'AULA:'; worksheet.getCell(`B${infoStartRow} `).value = itemName;
    }
  }

  const headerStartRow = 10;
  const weekRowValues: string[] = [];
  const dateRowValues: string[] = [];
  const dayRowValues: string[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = weeksList[w].start;
    weekRowValues.push(`SEMANA ${w + 1} `, '', '', '', '', '', '', '', '');
    dateRowValues.push('', '');
    for (let i = 0; i < 7; i++) {
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
    const weekStart = weeksList[w].start;
    const weekEnd = weeksList[w].end;

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
          cell.value = `FERIADO NO LABORABLE\n${holiday.name.toUpperCase()} \n07: 45 - 17: 42`;
          if (excelEndRow > excelStartRow) {
            try { worksheet.mergeCells(excelStartRow, colIndex, excelEndRow, colIndex); } catch (e) { }
          }
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
            const extraWindows: { start: number; end: number }[] = [];
            let isExtraEnabled = false;

            if (extraHoursConfig && !isHolidayDate(actualDate) &&
              (!extraHoursConfig.startDate || actualDate >= new Date(extraHoursConfig.startDate)) &&
              (!extraHoursConfig.endDate || actualDate <= new Date(extraHoursConfig.endDate))) {
              isExtraEnabled = true;
              const dayShifts = extraHoursConfig.shifts[DAYS_OF_WEEK[dIdx].key];
              if (dayShifts?.morning?.start && dayShifts?.morning?.end) {
                extraWindows.push({ start: timeToMin(dayShifts.morning.start), end: timeToMin(dayShifts.morning.end) });
              }
              if (dayShifts?.afternoon?.start && dayShifts?.afternoon?.end) {
                extraWindows.push({ start: timeToMin(dayShifts.afternoon.start), end: timeToMin(dayShifts.afternoon.end) });
              }
            }

            const taskStartMin = timeToMin(sched.startTime);
            const taskEndMin = timeToMin(sched.endTime);

            // Calculate fragments for this task based on extra time windows
            let splitPoints = new Set<number>([taskStartMin, taskEndMin]);
            if (isExtraEnabled) {
              extraWindows.forEach(win => {
                if (win.start > taskStartMin && win.start < taskEndMin) splitPoints.add(win.start);
                if (win.end > taskStartMin && win.end < taskEndMin) splitPoints.add(win.end);
              });
            }

            const sortedPoints = Array.from(splitPoints).sort((a, b) => a - b);

            for (let i = 0; i < sortedPoints.length - 1; i++) {
              const fragStart = sortedPoints[i];
              const fragEnd = sortedPoints[i + 1];
              const mid = (fragStart + fragEnd) / 2;
              const isExtra = isExtraEnabled && extraWindows.some(win => mid >= win.start && mid <= win.end);

              const sIdx = findClosestSlotIdx(formatMinutesToTime(fragStart), timeSlots);
              let eIdx = findClosestSlotIdx(formatMinutesToTime(fragEnd), timeSlots) - 1;

              if (sIdx !== -1 && eIdx >= sIdx) {
                const excelStartRow = startGridRow + sIdx;
                const excelEndRow = startGridRow + eIdx;
                const cell = worksheet.getCell(excelStartRow, colIndex);

                let displayStartTime = formatMinutesToTime(fragStart);
                let displayEndTime = formatMinutesToTime(fragEnd);

                if (sched.isAdministrative) {
                  const taskName = sched.category === 'refrigerio' ? 'REFRIGERIO' : (sched.category === 'preparacion' ? 'PREPARACIÓN DE CLASE' : (sched.category === 'asincrona' ? 'ASÍNCRONA' : (sched.category === 'por_asignar' ? 'HORAS POR ASIGNAR' : (sched.category === 'coordinador' ? 'COORDINADOR CARRERA' : sched.courseName))));
                  const modalitySuffix = sched.modality ? ` ${sched.modality.toUpperCase()} ` : '';
                  cell.value = `${taskName}${modalitySuffix}${isExtra ? '\n(EXTRAS)' : ''}\n${displayStartTime} - ${displayEndTime}`;
                } else {
                  const instructorLine = type === 'Instructor' ? '' : `Docente: ${sched.instructor} \n`;
                  cell.value = `${sched.nrc} - ${sched.block} \n${sched.courseName}${isExtra ? ' (EXTRAS)' : ''} \n${sched.activity} \n${instructorLine}${sched.building} -${sched.room} \n${displayStartTime} -${displayEndTime} `;
                }

                if (excelEndRow > excelStartRow) {
                  try { worksheet.mergeCells(excelStartRow, colIndex, excelEndRow, colIndex); } catch (e) { }
                }

                let hexColor = isExtra ? 'E5E7EB' : getHexColor(sched.color);

                if (!isExtra) {
                  const isAutoestudio = sched.meetingType === 'VAEE' || (sched.activity && sched.activity.toUpperCase().includes('AUTOESTUDIO'));
                  if (sched.category === 'asincrona') hexColor = 'E4F4DD';
                  else if (sched.category === 'preparacion') hexColor = sched.modality === 'presencial' ? 'EABC2D' : 'FFFA48';
                  else if (sched.category === 'refrigerio') hexColor = 'FFEDD5';
                  else if (sched.category === 'por_asignar') hexColor = 'F5F3FF';
                  else if (!sched.isAdministrative) hexColor = isAutoestudio ? 'E2E8F0' : 'D9FFFF';
                }

                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hexColor } };
                cell.font = { size: 7, bold: true, color: { argb: 'FF000000' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
              }
            }

            const duration = (taskEndMin - taskStartMin) / 60;
            if (sched.category === 'asincrona') wAsync += duration;
            else if (sched.category === 'preparacion') wPC += duration;
            else if (sched.category === 'coordinador') wCoord += duration;
            else if (sched.category === 'por_asignar') wOther += duration;
            else if (!isExcludedFromTotalLoad(sched)) {
              if (isOtherFunctionsCourse(sched)) {
                wCoord += duration;
              } else {
                wSync += duration;
              }
            }
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
        ['HORAS SINCRONAS', formatTimeLabel(s.sync)],
        ['HORAS ASINCRONAS', formatTimeLabel(s.async)],
        ['PC', formatTimeLabel(s.pc)],
        ['OTRAS FUNCIONES', formatTimeLabel(s.coord)],
        ['HORAS POR ASIGNAR', formatTimeLabel(s.other)],
        ['TOTAL SEMANA', formatTimeLabel(s.sync + s.async + s.pc + s.coord + s.other)]
      ];
      rows.forEach((r, idx) => {
        const rowIdx = summaryStartRow + idx;
        const cellLabel = worksheet.getCell(rowIdx, colOffset + 4);
        const cellValue = worksheet.getCell(rowIdx, colOffset + 5);
        cellLabel.value = r[0];
        cellValue.value = r[1];
        cellLabel.font = { bold: true, size: 8 };
        cellValue.font = { bold: true, size: 8 };
        cellLabel.alignment = { horizontal: 'left' };
        cellValue.alignment = { horizontal: 'right' };
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
    const uniqueAcademicLines = Array.from(new Set(academicSchedules.map(s => `${s.nrc}| ${s.block}| ${s.courseName}| ${s.activity}| ${s.building} -${s.room}| ${s.startDate.getTime()}| ${s.endDate.getTime()} `)));

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

      for (let i = 1; i <= 7; i++) {
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

export const generateGlobalAuditExcel = async (instructors: Instructor[], schedules: ProcessedSchedule[], holidays: HolidayData[]): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Auditoría Global');

  if (schedules.length === 0) return new Blob();

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const globalStart = getStartOfWeek(SEMESTER_START_DATE);
  const globalEnd = new Date(SEMESTER_END_DATE);

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
  headerRow1.values = ['ID', 'TRABAJADOR', 'TIPO', 'ESPECIALIDAD', ...weeks.flatMap(w => [`SEMANA ${w.start.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} `, ''])];
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
      const scanStart = w.start.getTime();
      const scanEndAt = w.end.getTime();

      // Meta Carga
      if (inst.type === 'TC') {
        wMeta = 46;
      } else {
        const fileSess = instAcademic.filter(s => s.startDate.getTime() <= scanEndAt && s.endDate.getTime() >= scanStart);
        wMeta = fileSess.reduce((acc, s) => acc + s.weeklyHours, 0);

        // Descontar feriados de la meta para TP
        for (let i = 0; i < 7; i++) {
          const d = new Date(w.start); d.setDate(w.start.getDate() + i);
          if (d > SEMESTER_END_DATE) continue;
          const hol = holidays.find(h => h.date.toDateString() === d.toDateString());
          if (hol) {
            const dName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][d.getDay()];
            const daySessions = instAcademic.filter(s => s.days.includes(dName) && d >= s.startDate && d <= s.endDate);
            const lostMin = daySessions.reduce((acc, s) => acc + (timeToMin(s.endTime) - timeToMin(s.startTime)), 0);
            wMeta -= (lostMin / 60);
          }
        }
      }

      // Ejecución Real
      for (let i = 0; i < 7; i++) {
        const d = new Date(w.start); d.setDate(w.start.getDate() + i);
        if (d > SEMESTER_END_DATE) continue;

        const dName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][d.getDay()];
        const hol = holidays.find(h => h.date.toDateString() === d.toDateString());

        instSchedules.filter(s => s.days.includes(dName) && d >= s.startDate && d <= s.endDate).forEach(s => {
          const dur = (timeToMin(s.endTime) - timeToMin(s.startTime)) / 60;
          if (inst.type === 'TC') {
            if (isContractualLoad(s) && !hol) wReal += dur;
          } else {
            if (isAcademicMetaLoad(s) && !hol) wReal += dur;
          }
        });
      }
      rowValues.push(Number(Math.max(0, wMeta).toFixed(2)), Number(wReal.toFixed(2)));
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

export const generateAdminTasksExcel = async (instructorName: string, schedules: ProcessedSchedule[], instructorInfo?: Instructor): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tareas Administrativas');

  const instructorSchedules = schedules.filter(s => s.instructor === instructorName);
  const adminSchedules = instructorSchedules.filter(s => s.isAdministrative);

  // Cabecera de información del instructor
  worksheet.getCell('A1').value = 'ID DOCENTE:';
  worksheet.getCell('B1').value = instructorInfo?.id || 'N/A';
  worksheet.getCell('A2').value = 'INSTRUCTOR:';
  worksheet.getCell('B2').value = instructorName.toUpperCase();

  ['A1', 'A2'].forEach(ref => {
    const cell = worksheet.getCell(ref);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  });

  const categories = [
    { title: 'SESIONES ASÍNCRONAS', filter: (s: ProcessedSchedule) => s.category === 'asincrona' },
    { title: 'PREPARACIÓN DE CLASE', filter: (s: ProcessedSchedule) => s.category === 'preparacion' },
    { title: 'COORDINADOR DE CARRERA / OTRAS FUNCIONES', filter: (s: ProcessedSchedule) => s.category === 'coordinador' || isOtherFunctionsCourse(s) }
  ];

  let currentRow = 4;

  const header = ['TIPO', 'FECHA', 'FECHA_FIN', 'DOM', 'LUN', 'MAR', 'MIER', 'JUE', 'VIE', 'SAB', 'HORA_INICIO', 'HORA_FIN', 'EDIFICIO'];

  const timeToVal = (time: string, offset: number) => {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + offset;
    const fh = Math.floor(total / 60);
    const fm = total % 60;
    return `${String(fh).padStart(2, '0')}${String(fm).padStart(2, '0')}`;
  };

  categories.forEach(cat => {
    const items = adminSchedules.filter(cat.filter);
    if (items.length === 0) return;

    const titleCell = worksheet.getCell(currentRow, 1);
    titleCell.value = cat.title;
    titleCell.font = { bold: true, size: 12 };
    currentRow++;

    const headerRow = worksheet.getRow(currentRow);
    headerRow.values = header;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    currentRow++;

    items.forEach(item => {
      const dayFlags = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'].map(d => item.days.includes(d) ? '1' : '');

      // Lógica de adyacencia para ajuste de 1 minuto
      const hasSessionBefore = instructorSchedules.some(s =>
        s.id !== item.id &&
        s.endTime === item.startTime &&
        s.days.some(d => item.days.includes(d)) &&
        s.startDate <= item.endDate && s.endDate >= item.startDate
      );

      const hasSessionAfter = instructorSchedules.some(s =>
        s.id !== item.id &&
        s.startTime === item.endTime &&
        s.days.some(d => item.days.includes(d)) &&
        s.startDate <= item.endDate && s.endDate >= item.startDate
      );

      const finalStart = hasSessionBefore ? timeToVal(item.startTime, 1) : item.startTime.replace(':', '');
      const finalEnd = hasSessionAfter ? timeToVal(item.endTime, -1) : item.endTime.replace(':', '');

      const rowData = [
        item.modality === 'virtual' ? 'REMT' : 'CLAS',
        item.startDate.toLocaleDateString('es-ES'),
        item.endDate.toLocaleDateString('es-ES'),
        ...dayFlags,
        finalStart,
        finalEnd,
        item.modality === 'virtual' ? 'SV-EV' : '00-AC'
      ];
      const row = worksheet.addRow(rowData);
      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      currentRow++;
    });

    currentRow += 2;
  });

  worksheet.columns = [
    { width: 35 }, { width: 12 }, { width: 12 },
    { width: 5 }, { width: 5 }, { width: 5 }, { width: 5 }, { width: 5 }, { width: 5 }, { width: 5 },
    { width: 12 }, { width: 12 }, { width: 12 }
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const generateIdealStructureExport = async (schedules: ProcessedSchedule[], instructors: Instructor[]): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data Ideal');

  // Encabezados Estructura Ideal
  const headers = [
    'NRC', 'ID_INST', 'INSTRUCTOR', 'CURSO', 'TIPO_ACT', 'ACTIVIDAD', 'HORARIO',
    'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM',
    'F_INICIO', 'F_FIN', 'EDIFICIO', 'AULA', 'IND_SESION'
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.values = headers;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  });

  // Mapeo días
  const dayMap: Record<string, number> = {
    'LUNES': 7, 'MARTES': 8, 'MIERCOLES': 9, 'JUEVES': 10, 'VIERNES': 11, 'SABADO': 12, 'DOMINGO': 13
  };

  schedules.forEach(s => {
    // Formato horario: HH:MM - HH:MM
    const horario = `${s.startTime} - ${s.endTime}`;

    // Determinar flags de días (X)
    const daysFlags = Array(7).fill('');
    s.days.forEach(d => {
      const idx = dayMap[d.toUpperCase()];
      if (idx) daysFlags[idx - 7] = 'X';
    });

    // IND_SESION: Simulado 1 por ahora (un instructor por nrc en esta fila)
    const indSesion = 1;

    const rowData = [
      s.nrc || '-',
      s.instructorId || '',
      s.instructor || '',
      s.courseName || '',
      s.meetingType || '', // TIPO_ACT
      s.activity || '',    // ACTIVIDAD
      horario,
      ...daysFlags,
      s.startDate.toLocaleDateString('es-ES'),
      s.endDate.toLocaleDateString('es-ES'),
      s.building || '',
      s.room || '',
      indSesion
    ];

    worksheet.addRow(rowData);
  });

  worksheet.columns.forEach(col => { col.width = 15; });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
