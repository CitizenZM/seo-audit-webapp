'use client';

import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface RadarChartProps {
  scores: {
    onPage: number;
    technical: number;
    content: number;
    links: number;
    keywords: number;
    schema: number;
  };
}

export default function RadarChart({ scores }: RadarChartProps) {
  const data = {
    labels: ['On-Page SEO', 'Technical', 'Content Depth', 'Backlinks', 'Keyword Coverage', 'Schema Markup'],
    datasets: [
      {
        label: 'Tote&Carry',
        data: [scores.onPage, scores.technical, scores.content, scores.links, scores.keywords, scores.schema],
        backgroundColor: 'rgba(22, 163, 74, 0.12)',
        borderColor: '#16a34a',
        pointBackgroundColor: '#16a34a',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    scales: {
      r: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(20, 21, 26, 0.08)' },
        angleLines: { color: 'rgba(20, 21, 26, 0.08)' },
        pointLabels: { color: '#5b6170', font: { size: 11 } },
        ticks: { color: '#8a90a0', backdropColor: 'transparent', stepSize: 25 },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  return <Radar data={data} options={options} />;
}
