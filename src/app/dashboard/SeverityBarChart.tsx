'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface SeverityBarChartProps {
  issues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export default function SeverityBarChart({ issues }: SeverityBarChartProps) {
  const data = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [
      {
        label: 'Issues Found',
        data: [issues.critical, issues.high, issues.medium, issues.low],
        backgroundColor: [
          'rgba(231, 76, 60, 0.8)',
          'rgba(243, 156, 18, 0.8)',
          'rgba(52, 152, 219, 0.7)',
          'rgba(149, 165, 166, 0.5)',
        ],
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        grid: { color: 'rgba(20, 21, 26, 0.06)' },
        ticks: { color: '#8a90a0', stepSize: 1 },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#5b6170', font: { size: 12 } },
      },
    },
  };

  return <Bar data={data} options={options} />;
}
