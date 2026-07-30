import ExcelJS from 'exceljs';

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1E293B' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const EXAMPLE_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } };
const EXAMPLE_FONT = { italic: true, color: { argb: 'FF92400E' } };

const styleHeaderRow = (row: ExcelJS.Row) => {
  row.eachCell(cell => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
};

const styleExampleRow = (row: ExcelJS.Row) => {
  row.eachCell(cell => {
    cell.font = EXAMPLE_FONT;
    cell.fill = EXAMPLE_FILL;
  });
};

const addSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  columns: { header: string; width?: number }[],
  exampleRow: (string | number)[]
) => {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(c => ({ header: c.header, width: c.width || 18 }));
  styleHeaderRow(sheet.getRow(1));
  const row = sheet.addRow(exampleRow);
  styleExampleRow(row);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
};

const addInstructionsSheet = (workbook: ExcelJS.Workbook, title: string, lines: string[]) => {
  const info = workbook.addWorksheet('Instrucciones');
  info.getColumn(1).width = 100;
  const titleRow = info.addRow([title]);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
  info.addRow([]);
  lines.forEach(l => {
    const r = info.addRow([l]);
    r.getCell(1).alignment = { wrapText: true };
  });
};

const toBlob = async (workbook: ExcelJS.Workbook): Promise<Blob> => {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const addCareersReferenceSheet = (workbook: ExcelJS.Workbook, careersMap: Record<string, string>) => {
  const careersSheet = workbook.addWorksheet('Carreras (referencia)');
  careersSheet.columns = [{ header: 'COD_CARRERA', width: 16 }, { header: 'CARRERA', width: 34 }];
  styleHeaderRow(careersSheet.getRow(1));
  const noteRow = careersSheet.addRow(['(No se importa)', 'Ya está registrado en Supabase — solo para consulta']);
  noteRow.eachCell(c => { c.font = { italic: true, color: { argb: 'FF64748B' } }; });
  Object.entries(careersMap).sort(([, a], [, b]) => a.localeCompare(b)).forEach(([code, name]) => {
    careersSheet.addRow([code, name]);
  });
};

/**
 * Plantilla de Programación (uso exclusivo de "Actualizar Excel"): Instrucciones +
 * Programación + Feriados + Carreras de referencia. Instructores y Aulas ya NO van aquí
 * — tienen su propia plantilla y su propio flujo de carga en sus respectivas páginas de
 * Gestión (InstructorsPage / RoomsPage), para no saturar este archivo.
 */
export const generateProgramacionTemplate = async (careersMap: Record<string, string> = {}): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AcademiTrack';
  workbook.created = new Date();

  addInstructionsSheet(workbook, 'Plantilla de Programación — AcademiTrack', [
    'Cómo funciona esta plantilla:',
    '',
    '1. Esta plantilla es exclusiva para PROGRAMACIÓN (horarios). Instructores y Aulas se',
    '   cargan desde sus propias páginas de Gestión ("Instructores" y "Ambientes"), cada',
    '   una con su propia plantilla — así este archivo no se satura.',
    '',
    '2. El importador detecta la hoja de horarios por nombre (cualquiera que contenga',
    '   "progr"), y la de feriados por nombre (que contenga "feriado"). Puedes borrar la',
    '   hoja de Feriados si no vas a actualizarla en esta carga.',
    '',
    '3. Los nombres de columna admiten variantes razonables (sin tildes, mayúsculas/',
    '   minúsculas, con o sin guion bajo). Revisa la fila de ejemplo (en amarillo) de cada',
    '   hoja para ver el formato esperado, y bórrala antes de subir tus datos reales.',
    '',
    '4. Si dejas la columna CARRERA vacía, el sistema intenta deducirla automáticamente a',
    '   partir del código de programa embebido en el BLOQUE (ej. "06NAEDE201" -> NAED ->',
    '   Administrac Empresas (DUAL)), usando el catálogo de la hoja "Carreras" (solo',
    '   referencia aquí; el catálogo real vive en Supabase, tabla careers).',
    '',
    '5. Si el archivo referencia un instructor o aula que no existe todavía en el',
    '   catálogo, el sistema te lo mostrará en un panel antes de sincronizar, para que lo',
    '   registres ahí mismo o vayas a darlo de alta en su página correspondiente.',
    '',
    '6. Al subir el archivo, elige el modo de sincronización:',
    '   • DELTA: reemplaza solo los NRC que trae el archivo. Para correcciones puntuales.',
    '   • INFORMACIÓN NUEVO PERIODO (recomendado para la primera carga de un semestre):',
    '     reemplaza TODA la programación académica del periodo, sin dejar NRC huérfanos.',
    '   • FULL: además del periodo, reemplaza instructores/aulas/feriados si el archivo',
    '     los trae (no aplica normalmente, ya que ahora se cargan aparte).',
  ]);

  addSheet(
    workbook,
    'Programación',
    [
      { header: 'PERIODO' }, { header: 'NRC' }, { header: 'CARRERA', width: 28 },
      { header: 'SEMESTRE' }, { header: 'BLOQUE' }, { header: 'MAT_CUR' },
      { header: 'DESCRIPCION_CURSO', width: 32 }, { header: 'ACTIVIDAD' }, { header: 'TIPO_REUNION' },
      { header: 'INSTRUCTOR', width: 28 }, { header: 'ID_INST' }, { header: 'EDIFICIO' }, { header: 'SALON' },
      { header: 'LUNES', width: 8 }, { header: 'MARTES', width: 8 }, { header: 'MIERCOLES', width: 8 },
      { header: 'JUEVES', width: 8 }, { header: 'VIERNES', width: 8 }, { header: 'SABADO', width: 8 }, { header: 'DOMINGO', width: 8 },
      { header: 'HORA_INI' }, { header: 'HORA_FIN' }, { header: 'D_INICIO' }, { header: 'D_FIN' },
      { header: 'HORAS_SEMANALES' }, { header: 'AFORO' },
    ],
    [
      202620, 12174, 'Administrac Empresas (DUAL)', 'III', '06NAEDE201', 'NCCU-276',
      'ADMINISTRACION Y ORGANIZACION DE EMPRESAS', 'TEC', 'CLAS',
      'MENDIETA ALARCON, LUIS', '586498', '82-PF', '102',
      'X', '', '', '', '', '', '',
      '13:15', '17:00', '12/10/2026', '08/11/2026',
      3.75, 23
    ]
  );

  addSheet(
    workbook,
    'Feriados',
    [
      { header: 'DIA_FERIADO', width: 16 }, { header: 'CELEBRACION', width: 24 }, { header: 'NOMBRE_DIA', width: 24 },
    ],
    ['25/12/2026', 'Navidad', 'Feriado Nacional']
  );

  addCareersReferenceSheet(workbook, careersMap);

  return toBlob(workbook);
};

/**
 * Plantilla dedicada al catálogo de Instructores (uso desde InstructorsPage).
 */
export const generateInstructoresTemplate = async (): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AcademiTrack';
  workbook.created = new Date();

  addInstructionsSheet(workbook, 'Plantilla de Instructores — AcademiTrack', [
    'Sube este archivo desde "Gestión de Instructores" para dar de alta o actualizar',
    'instructores en lote. La carga es siempre upsert por ID: agrega los nuevos y',
    'actualiza los existentes; nunca borra un instructor que no venga en el archivo.',
    '',
    'Revisa la fila de ejemplo (en amarillo) y bórrala antes de subir tus datos reales.',
    'Los nombres de columna admiten variantes razonables (sin tildes, mayúsculas/',
    'minúsculas, con o sin guion bajo).',
  ]);

  addSheet(
    workbook,
    'Instructores',
    [
      { header: 'ID' }, { header: 'TRABAJADOR', width: 28 }, { header: 'TIPO' },
      { header: 'HORAS_MAX' }, { header: 'ESPECIALIDAD', width: 24 }, { header: 'SEDE' }, { header: 'ESTADO' },
    ],
    ['586498', 'MENDIETA ALARCON, LUIS', 'TC', 40, 'Administración', 'Lima Centro', 'Activo']
  );

  return toBlob(workbook);
};

/**
 * Plantilla dedicada al catálogo de Aulas (uso desde RoomsPage).
 */
export const generateAulaTemplate = async (): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AcademiTrack';
  workbook.created = new Date();

  addInstructionsSheet(workbook, 'Plantilla de Aulas — AcademiTrack', [
    'Sube este archivo desde "Gestión de Ambientes" para dar de alta o actualizar aulas',
    'en lote. La carga es siempre upsert por Edificio+Aula: agrega las nuevas y',
    'actualiza las existentes; nunca borra un aula que no venga en el archivo.',
    '',
    'Revisa la fila de ejemplo (en amarillo) y bórrala antes de subir tus datos reales.',
    'Los nombres de columna admiten variantes razonables (sin tildes, mayúsculas/',
    'minúsculas, con o sin guion bajo).',
  ]);

  addSheet(
    workbook,
    'Aula',
    [
      { header: 'CARRERA', width: 28 }, { header: 'EDIF' }, { header: 'AULA' },
      { header: 'DESCRIPCION_ACTUAL', width: 24 }, { header: 'TIPO' }, { header: 'AFORO' },
    ],
    ['Administrac Empresas (DUAL)', '82', '102', 'Aula Teórica', 'AULA', 30]
  );

  return toBlob(workbook);
};
