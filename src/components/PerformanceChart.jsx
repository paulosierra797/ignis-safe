import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { shortenModuleLabels } from '../utils/chartLabelUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const data = {
  labels: [],
  datasets: [
    {
      label: 'Attempts',
      data: [0, 0, 0],
      backgroundColor: '#b91c1c',
      borderRadius: 6,
      barPercentage: 0.5,
      categoryPercentage: 0.5
    }
  ]
};

export default function PerformanceChart({ chartData }) {
  const fullLabels = chartData?.labels?.length ? chartData.labels : data.labels;
  const liveAttempts = chartData?.attempts?.length ? chartData.attempts : data.datasets[0].data;

  const liveData = {
    labels: shortenModuleLabels(fullLabels),
    datasets: [
      {
        ...data.datasets[0],
        data: liveAttempts,
      },
    ],
  };

  const maxAttempt = Math.max(...liveAttempts, 0);
  const dynamicMax = maxAttempt > 0 ? Math.ceil(maxAttempt * 1.2) : 5;

  return (
    <div style={{ height: '200px', width: '100%' }}>
      <Bar
        data={liveData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            title: {
              display: false
            },
            tooltip: {
              callbacks: {
                title: (items) => fullLabels[items[0]?.dataIndex] ?? ''
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: dynamicMax,
              ticks: {
                precision: 0
              }
            },
            x: {
              ticks: {
                autoSkip: false,
                maxRotation: 0,
                minRotation: 0,
              },
            },
          }
        }}
      />
    </div>
  );
}
