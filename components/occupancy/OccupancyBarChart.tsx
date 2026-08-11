import React from 'react';

interface BarDatum {
    label: string;
    pct: number;
}

interface OccupancyBarChartProps {
    data: BarDatum[];
    /** 'vertical' para series por categoría (ej. días); 'horizontal' para pocas categorías anchas (ej. turnos). */
    orientation?: 'vertical' | 'horizontal';
}

const PRIMARY = '#4f46e5'; // indigo-600, mismo acento que el resto de la app (ReportsDashboard/AuditStatsCards)
const OVER = '#e11d48';    // rose-600, reservado para >100% (sobre-reserva), nunca para "mucho uso"

/**
 * Barra simple de una sola serie (ocupación %). El eje se escala a max(100, valor
 * más alto) para que una barra con doble reserva no se salga del gráfico — la marca
 * de 100% queda como referencia punteada. Sin librería externa (la app no tiene
 * ninguna instalada); sigue las especificaciones de marks-and-anatomy del skill de
 * dataviz: extremos redondeados, separación entre barras, tooltip nativo por barra.
 */
const OccupancyBarChart: React.FC<OccupancyBarChartProps> = ({ data, orientation = 'vertical' }) => {
    const maxVal = Math.max(100, ...data.map(d => d.pct)) * 1.1;

    if (orientation === 'horizontal') {
        const rowH = 34;
        const height = data.length * rowH + 10;
        const width = 100; // porcentaje del contenedor, viewBox virtual
        const refX = (100 / maxVal) * 100;

        return (
            <svg viewBox={`0 0 320 ${height}`} className="w-full" style={{ height }} role="img" aria-label="Ocupación por turno">
                <line x1={100 + (refX * 1.9)} y1={0} x2={100 + (refX * 1.9)} y2={height} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3" />
                {data.map((d, i) => {
                    const barMaxW = 190;
                    const w = Math.max(2, (d.pct / maxVal) * barMaxW);
                    const y = i * rowH + 6;
                    const isOver = d.pct > 100.01;
                    return (
                        <g key={d.label}>
                            <title>{`${d.label}: ${d.pct.toFixed(1)}%`}</title>
                            <text x={0} y={y + 14} className="fill-slate-500" fontSize="11" fontWeight="700">{d.label}</text>
                            <rect x={100} y={y} width={barMaxW} height={20} rx={4} className="fill-slate-100" />
                            <rect x={100} y={y} width={w} height={20} rx={4} fill={isOver ? OVER : PRIMARY} />
                            <text x={100 + w + 6} y={y + 14} fontSize="11" fontWeight="800" fill={isOver ? OVER : '#1e293b'}>{d.pct.toFixed(0)}%</text>
                        </g>
                    );
                })}
            </svg>
        );
    }

    const barW = 28;
    const gap = 14;
    const chartH = 130;
    const width = data.length * (barW + gap) + gap;
    const refY = chartH - (100 / maxVal) * chartH;

    return (
        <svg viewBox={`0 0 ${width} ${chartH + 30}`} className="w-full" style={{ height: chartH + 30 }} role="img" aria-label="Ocupación por día de la semana">
            <line x1={0} y1={refY} x2={width} y2={refY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3" />
            {data.map((d, i) => {
                const x = gap + i * (barW + gap);
                const h = Math.max(2, (d.pct / maxVal) * chartH);
                const y = chartH - h;
                const isOver = d.pct > 100.01;
                return (
                    <g key={d.label}>
                        <title>{`${d.label}: ${d.pct.toFixed(1)}%`}</title>
                        <rect x={x} y={y} width={barW} height={h} rx={4} fill={isOver ? OVER : PRIMARY} />
                        <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="10" fontWeight="800" fill={isOver ? OVER : '#1e293b'}>
                            {d.pct.toFixed(0)}%
                        </text>
                        <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-slate-400">
                            {d.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default OccupancyBarChart;
