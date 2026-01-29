
import React from 'react';

export const DAYS_OF_WEEK = [
  { key: 'LUNES', label: 'Lunes' },
  { key: 'MARTES', label: 'Martes' },
  { key: 'MIERCOLES', label: 'Miercoles' },
  { key: 'JUEVES', label: 'Jueves' },
  { key: 'VIERNES', label: 'Viernes' },
  { key: 'SABADO', label: 'Sabado' },
  { key: 'DOMINGO', label: 'Domingo' },
];

export const COLORS = [
  'bg-blue-100 border-blue-500 text-blue-900',
  'bg-emerald-100 border-emerald-500 text-emerald-900',
  'bg-purple-100 border-purple-500 text-purple-900',
  'bg-amber-100 border-amber-500 text-amber-900',
  'bg-rose-100 border-rose-500 text-rose-900',
  'bg-indigo-100 border-indigo-500 text-indigo-900',
  'bg-cyan-100 border-cyan-500 text-cyan-900',
  'bg-orange-100 border-orange-400 text-orange-900',
  'bg-pink-100 border-pink-500 text-pink-900',
  'bg-lime-100 border-lime-500 text-lime-900',
  'bg-violet-100 border-violet-500 text-violet-900',
  'bg-fuchsia-100 border-fuchsia-500 text-fuchsia-900',
  'bg-sky-100 border-sky-500 text-sky-900',
  'bg-teal-100 border-teal-500 text-teal-900',
  'bg-yellow-100 border-yellow-500 text-yellow-900',
  'bg-red-100 border-red-500 text-red-900',
  'bg-slate-100 border-slate-500 text-slate-900',
  'bg-zinc-100 border-zinc-500 text-zinc-900',
  'bg-orange-50 border-orange-400 text-orange-950',
  'bg-emerald-50 border-emerald-400 text-emerald-950',
];

export const CONTRACT_HOURS_TC = 46.0;

export const SEMESTER_START_DATE = new Date(2026, 1, 16); // 16/02/2026
export const SEMESTER_END_DATE = new Date(2026, 5, 28);   // 28/06/2026
export const CUT_OFF_DATE = new Date(2026, 5, 7);      // 07/06/2026

export const TASK_ABBREVIATIONS: Record<string, string> = {
  'Horas Asíncronas': 'Hor Asinc',
  'Asíncrona': 'Asinc',
  'Preparación de Clase': 'Prep Clase',
  'Coordinador Carrera': 'Coord Carr',
  'Horas por Asignar': 'Hor Asig',
  'Refrigerio': 'Refrig'
};

export const getShortLabel = (label: string) => TASK_ABBREVIATIONS[label] || label;

export const getHexColor = (tailwindClass: string): string => {
  const mapping: Record<string, string> = {
    'bg-blue-100': 'DBEAFE',
    'bg-emerald-100': 'D1FAE5',
    'bg-purple-100': 'F3E8FF',
    'bg-amber-100': 'FEF3C7',
    'bg-rose-100': 'FFE4E6',
    'bg-indigo-100': 'E0E7FF',
    'bg-cyan-100': 'CFFAFE',
    'bg-orange-100': 'FFEDD5',
    'bg-pink-100': 'FCE7F3',
    'bg-lime-100': 'ECFCCB',
    'bg-violet-100': 'EDE9FE',
    'bg-fuchsia-100': 'FAE8FF',
    'bg-sky-100': 'E0F2FE',
    'bg-teal-100': 'CCFBF1',
    'bg-yellow-100': 'FEF9C3',
    'bg-red-100': 'FEE2E2',
    'bg-slate-100': 'F1F5F9',
    'bg-zinc-100': 'F4F4F5',
    'bg-orange-50': 'FFF7ED',
    'bg-emerald-50': 'ECFDF5',
    'bg-cyan-50': 'ECFEFF',
    'bg-slate-200': 'E2E8F0',
    'bg-[#D9FFFF]': 'D9FFFF',
    'bg-[#FEE2E2]': 'FEE2E2'
  };
  const bgClass = tailwindClass.split(' ').find(c => c.startsWith('bg-')) || '';
  return mapping[bgClass] || mapping[tailwindClass] || 'FFFFFF';
};

export const TIME_START = 7;
export const TIME_END = 22;
export const MAX_ACADEMIC_HOUR = "22:30";

export interface TimeSlotConfig {
  hour: number;
  minute: number;
  label: string;
  isMainHour: boolean;
}

export const getTimeSlots = (): TimeSlotConfig[] => {
  const slots: TimeSlotConfig[] = [];
  const startTotalMinutes = TIME_START * 60;
  const endTotalMinutes = TIME_END * 60 + 30;

  for (let total = startTotalMinutes; total <= endTotalMinutes; total += 15) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    slots.push({
      hour: h,
      minute: m,
      label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      isMainHour: m === 0
    });
  }
  return slots;
};

export const getDayFromHeader = (header: string): string | null => {
  const h = header.toUpperCase();
  if (h.includes('LUN')) return 'LUNES';
  if (h.includes('MAR')) return 'MARTES';
  if (h.includes('MIE')) return 'MIERCOLES';
  if (h.includes('JUE')) return 'JUEVES';
  if (h.includes('VIE')) return 'VIERNES';
  if (h.includes('SAB')) return 'SABADO';
  if (h.includes('DOM')) return 'DOMINGO';
  return null;
};
