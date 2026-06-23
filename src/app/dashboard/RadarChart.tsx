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
        backgroundColor: 'rgba(201, 168, 76, 0.15)',
        borderColor: '#C9A84C',
        pointBackgroundColor: '#C9A84C',
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
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        pointLabels: { color: '#ccc', font: { size: 11 } },
        ticks: { color: '#888', backdropColor: 'transparent', stepSize: 25 },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  return <Radar data={data} options={options} />;
}
