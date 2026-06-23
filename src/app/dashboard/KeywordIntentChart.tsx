'use client';

import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function KeywordIntentChart({ keywords }: { keywords: any[] }) {
  if (!keywords || keywords.length === 0) return null;

  const intentCounts = keywords.reduce((acc: any, kw: any) => {
    acc[kw.intent] = (acc[kw.intent] || 0) + 1;
    return acc;
  }, {});

  const data = {
    labels: Object.keys(intentCounts),
    datasets: [
      {
        data: Object.values(intentCounts),
        backgroundColor: [
          'rgba(52,152,219,0.7)',  // Commercial
          'rgba(155,89,182,0.7)',  // Informational
          'rgba(46,204,113,0.7)',  // Transactional
          'rgba(201,168,76,0.7)'   // Navigational / Other
        ],
        borderColor: ['#3498db', '#9b59b6', '#2ecc71', '#C9A84C'],
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#ccc', font: { size: 11 }, padding: 16 }
      }
    }
  };

  return (
    <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-6 h-full flex flex-col justify-center items-center">
      <h3 className="text-lg font-bold text-white mb-6 w-full text-left">Keyword Intent Mix</h3>
      <div className="w-full max-w-[280px]">
        <Doughnut data={data} options={options} />
      </div>
    </div>
  );
}
