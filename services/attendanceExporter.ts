
import ExcelJS from 'exceljs';
import { AttendanceSheetData } from './attendanceService';

// Convierte "HH:MM" a fracción de día (0-1), el formato numérico nativo que usa Excel
// para horas — necesario para que TOTAL HORAS pueda calcularse con fórmula (=(salida-inicio)*24)
// en vez de venir como texto precalculado.
const timeStringToExcelFraction = (t: string): number => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h + m / 60) / 24;
};

export const generateAttendanceExcel = async (data: AttendanceSheetData, logoUrl?: string): Promise<Blob> => {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS no evalúa fórmulas (no guarda el resultado en caché) — esto obliga a Excel
    // a recalcular TOTAL HORAS apenas se abre el archivo, en vez de mostrarlo en blanco.
    workbook.calcProperties.fullCalcOnLoad = true;
    const worksheet = workbook.addWorksheet('Asistencia');

    // Manejo de Logo
    if (logoUrl) {
        try {
            const response = await fetch(logoUrl);
            const buffer = await response.arrayBuffer();
            const imageId = workbook.addImage({
                buffer: buffer,
                extension: 'png',
            });
            // Posicionar logo en la esquina superior izquierda
            worksheet.addImage(imageId, {
                tl: { col: 0.1, row: 0.1 },
                ext: { width: 120, height: 60 }
            });
        } catch (error) {
            console.error("Error al cargar el logo:", error);
        }
    }

    // Configuración de impresión
    worksheet.pageSetup = {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToHeight: 0,
        fitToWidth: 1,
        blackAndWhite: true,
        margins: {
            left: 0.5, right: 0.5, top: 0.5, bottom: 0.5,
            header: 0.3, footer: 0.3
        }
    };

    // Configuración de anchos de columna
    worksheet.getColumn(1).width = 30; // CURSO
    worksheet.getColumn(2).width = 10; // SEDE
    worksheet.getColumn(3).width = 8;  // DÍA
    worksheet.getColumn(4).width = 12; // FECHA
    worksheet.getColumn(5).width = 12; // HORA INICIO
    worksheet.getColumn(6).width = 15; // FIRMA
    worksheet.getColumn(7).width = 12; // HORA SALIDA
    worksheet.getColumn(8).width = 15; // FIRMA2
    worksheet.getColumn(9).width = 12; // TOTAL HORAS
    worksheet.getColumn(10).width = 25; // Observaciones

    // --- CABECERA ---
    // Título principal
    worksheet.mergeCells('D1:J1');
    const titleCell = worksheet.getCell('D1');
    titleCell.value = 'Registro de Control de Asistencia del Personal por horas';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    // Bloque de información del trabajador (Izquierda) - Aumentamos 1 fila para evitar traslape con logo
    const labelStyle = { font: { bold: true, size: 10 } };

    worksheet.getCell('A4').value = 'RUC';
    worksheet.getCell('A4').font = labelStyle.font;
    worksheet.getCell('B4').value = ': 20131376503';

    worksheet.getCell('A5').value = 'C.F.P. / GERENCIA';
    worksheet.getCell('A5').font = labelStyle.font;
    worksheet.getCell('B5').value = ': ' + (data.instructor.campus || 'PIURA');

    worksheet.getCell('A6').value = 'Dirección';
    worksheet.getCell('A6').font = labelStyle.font;
    worksheet.getCell('B6').value = ': PIURA TUMBES';

    worksheet.getCell('A8').value = 'ID';
    worksheet.getCell('A8').font = labelStyle.font;
    worksheet.getCell('B8').value = data.instructor.id;
    worksheet.getCell('B8').font = { bold: true, size: 11 };

    worksheet.getCell('A9').value = 'TRABAJADOR:';
    worksheet.getCell('A9').font = labelStyle.font;
    worksheet.mergeCells('B9:E9');
    worksheet.getCell('B9').value = data.instructor.name.toUpperCase();
    worksheet.getCell('B9').font = { bold: true, size: 11 };
    worksheet.getCell('B9').border = { bottom: { style: 'thin' } };

    worksheet.getCell('A10').value = 'PUESTO:';
    worksheet.getCell('A10').font = labelStyle.font;
    worksheet.getCell('B10').value = 'INSTRUCTOR';

    // Bloque de periodo (Derecha)
    const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const startMonth = monthNames[data.periodStart.getMonth()];
    const endMonth = monthNames[data.periodEnd.getMonth()];
    const startYear = data.periodStart.getFullYear();
    const endYear = data.periodEnd.getFullYear();

    // Tabla de fechas de cierre - Bajamos a fila 4
    const rangeHeaderRow = 4;
    worksheet.mergeCells(rangeHeaderRow, 7, rangeHeaderRow, 7); // DE
    worksheet.getCell(rangeHeaderRow, 7).value = 'DE';
    worksheet.getCell(rangeHeaderRow, 8).value = 'AÑO';
    worksheet.getCell(rangeHeaderRow, 9).value = 'A';
    worksheet.getCell(rangeHeaderRow, 10).value = 'AÑO';

    [7, 8, 9, 10].forEach(c => {
        const cell = worksheet.getCell(rangeHeaderRow, c);
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });

    const rangeValuesRow = 5;
    worksheet.getCell(rangeValuesRow, 7).value = startMonth;
    worksheet.getCell(rangeValuesRow, 8).value = startYear;
    worksheet.getCell(rangeValuesRow, 9).value = endMonth;
    worksheet.getCell(rangeValuesRow, 10).value = endYear;
    [7, 8, 9, 10].forEach(c => {
        const cell = worksheet.getCell(rangeValuesRow, c);
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    worksheet.getCell(6, 7).value = 'CIERRE';
    worksheet.getCell(6, 7).font = { bold: true };
    worksheet.getCell(6, 7).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    worksheet.mergeCells(6, 8, 6, 8); // 20/MM/YYYY
    worksheet.getCell(6, 8).value = data.periodStart.toLocaleDateString('es-PE');
    worksheet.getCell(6, 8).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    worksheet.getCell(6, 8).alignment = { horizontal: 'center' };

    worksheet.mergeCells(6, 9, 6, 10); // 19/MM/YYYY
    worksheet.getCell(6, 9).value = data.periodEnd.toLocaleDateString('es-PE');
    worksheet.getCell(6, 9).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    worksheet.getCell(6, 9).alignment = { horizontal: 'center' };

    // Nota - Reemplaza la sección 'HORARIO' (Imagen 2)
    const notaRow = 7;
    worksheet.getCell(notaRow, 7).value = 'Nota:';
    worksheet.getCell(notaRow, 7).font = { bold: true, size: 8 };
    worksheet.getCell(notaRow + 1, 7).value = 'La planilla debe ir con los horarios PREIMPRESOS.';
    worksheet.getCell(notaRow + 1, 7).font = { size: 8 };
    worksheet.getCell(notaRow + 2, 7).value = 'El trabajador no debe completar datos, sólo debe firmar.';
    worksheet.getCell(notaRow + 2, 7).font = { size: 8 };

    // --- TABLA DE ASISTENCIA ---
    const tableHeaderRow = 13; // Ajustado por el cambio de filas superiores
    const headers = ['CURSO', 'SEDE', 'DÍA', 'FECHA', 'HORA INICIO', 'FIRMA', 'HORA SALIDA', 'FIRMA2', 'TOTAL HORAS', 'Observaciones'];

    const headerRow = worksheet.getRow(tableHeaderRow);
    headerRow.values = headers;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3498DB' } }; // Azul Senatiish
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    let currentRow = tableHeaderRow + 1;
    data.journeys.forEach(j => {
        const row = worksheet.getRow(currentRow);
        row.height = 25; // Requerimiento: Alto de fila de 25

        row.values = [
            j.courseName,
            '06', // Siempre "06" según requerimiento
            j.dayName,
            j.dateStr,
            timeStringToExcelFraction(j.startTime),
            '',
            timeStringToExcelFraction(j.endTime),
            '',
            { formula: `=(G${currentRow}-E${currentRow})*24`, result: j.totalHours },
            j.observations
        ];
        row.getCell(5).numFmt = 'hh:mm';
        row.getCell(7).numFmt = 'hh:mm';
        row.getCell(9).numFmt = '0.00';

        row.eachCell((cell, colNumber) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { size: 9 };
            if (colNumber === 1) cell.alignment.horizontal = 'left';
            if (colNumber === 9) cell.font.bold = true;
        });
        currentRow++;
    });

    // Footer / Firma
    worksheet.getCell(currentRow + 2, 8).value = '_________________________';
    worksheet.getCell(currentRow + 3, 8).value = 'Firma del Instructor';
    worksheet.getCell(currentRow + 3, 8).alignment = { horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
