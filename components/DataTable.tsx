
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Edit2, Trash2, Search, FilterX } from 'lucide-react';
import { ProcessedSchedule } from '../types';

interface DataTableProps {
  data: ProcessedSchedule[];
  onEdit: (record: ProcessedSchedule) => void;
  onDelete: (id: string) => void;
}

const ROW_HEIGHT = 65; // Altura estimada por fila incluyendo padding y bordes
const BUFFER_ROWS = 5; // Filas extra arriba y abajo para evitar parpadeos

const DataTable: React.FC<DataTableProps> = ({ data, onEdit, onDelete }) => {
  const [tableSearch, setTableSearch] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const tableFilteredData = useMemo(() => {
    if (!tableSearch) return data;
    const term = tableSearch.toLowerCase();
    return data.filter(s =>
      s.courseName.toLowerCase().includes(term) ||
      s.nrc.toLowerCase().includes(term) ||
      s.instructor.toLowerCase().includes(term) ||
      s.block.toLowerCase().includes(term) ||
      s.room.toLowerCase().includes(term) ||
      s.building.toLowerCase().includes(term)
    );
  }, [data, tableSearch]);

  // Actualizar altura del contenedor para calcular cuántas filas caben
  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);

      const handleResize = () => {
        if (containerRef.current) setContainerHeight(containerRef.current.clientHeight);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Cálculos de virtualización
  const totalRows = tableFilteredData.length;
  const totalHeight = totalRows * ROW_HEIGHT;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(totalRows - 1, Math.floor((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);

  const visibleRows = useMemo(() => {
    return tableFilteredData.slice(startIndex, endIndex + 1).map((row, index) => ({
      ...row,
      virtualIndex: startIndex + index
    }));
  }, [tableFilteredData, startIndex, endIndex]);

  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = Math.max(0, totalHeight - (endIndex + 1) * ROW_HEIGHT);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header con Buscador */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar información específica en esta tabla..."
            value={tableSearch}
            onChange={(e) => {
              setTableSearch(e.target.value);
              if (containerRef.current) containerRef.current.scrollTop = 0;
            }}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
          />
          {tableSearch && (
            <button
              onClick={() => {
                setTableSearch('');
                if (containerRef.current) containerRef.current.scrollTop = 0;
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100"
            >
              <FilterX size={14} />
            </button>
          )}
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {tableFilteredData.length} Registros encontrados
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative"
      >
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-50 sticky top-0 z-20 border-b border-slate-200 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">NRC</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Curso</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Bloque</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Instructor</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Aula</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Horario</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Vigencia</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: `${paddingTop}px` }} aria-hidden="true">
              <td colSpan={8} style={{ padding: 0 }}></td>
            </tr>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-slate-50 transition-colors group border-b border-slate-100"
                style={{ height: `${ROW_HEIGHT}px` }}
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-700 whitespace-nowrap">{row.nrc}</td>
                <td className="px-4 py-2 text-sm text-slate-600 font-semibold">{row.courseName}</td>
                <td className="px-4 py-2 text-sm text-slate-500">{row.block}</td>
                <td className="px-4 py-2 text-sm text-slate-500">{row.instructor}</td>
                <td className="px-4 py-2 text-sm text-slate-500">{row.building} - {row.room}</td>
                <td className="px-4 py-2 text-sm text-slate-500">
                  <div className="flex flex-col">
                    <span className="font-bold text-blue-600">{row.startTime} - {row.endTime}</span>
                    <span className="text-[10px] text-slate-400 uppercase">{row.days.join(', ')}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-[11px] text-slate-400 whitespace-nowrap">
                  {row.startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} al {row.endDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(row)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            <tr style={{ height: `${paddingBottom}px` }} aria-hidden="true">
              <td colSpan={8} style={{ padding: 0 }}></td>
            </tr>
            {totalRows === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 italic">
                  {data.length === 0
                    ? 'No hay registros para la selección actual de la lista lateral'
                    : 'No se encontraron registros que coincidan con la búsqueda específica'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
