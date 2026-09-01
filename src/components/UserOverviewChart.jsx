import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

export default function UserOverviewChart({ chartData, isLoading = false }) {
  const labels = chartData?.labels?.length
    ? chartData.labels
    : ['No Data'];

  const values = chartData?.values?.length
    ? chartData.values
    : [0];

  const data = {
    labels,
    datasets: [
      {
        label: 'Active Users',
        data: values,
        borderColor: '#f97316',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 220);
          gradient.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
          gradient.addColorStop(1, 'rgba(249, 115, 22, 0.02)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#f97316',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: !isLoading,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#f97316',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#718096',
          font: {
            family: 'Poppins',
            size: 11
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          display: true,
          precision: 0,
          color: '#667085',
          font: {
            family: 'Poppins',
            size: 10
          }
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    }
  };

  return <Line data={data} options={options} />;
}
