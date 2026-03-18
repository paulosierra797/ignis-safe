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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const options = {
  responsive: true,
  plugins: {
    legend: {
      display: false
    },
    title: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 400,
      ticks: {
        stepSize: 80
      }
    }
  }
};

const data = {
  labels: ['Module 1', 'Module 2', 'Module 3'],
  datasets: [
    {
      label: 'Attempts',
      data: [400, 320, 240],
      backgroundColor: '#b91c1c',
      borderRadius: 6,
      barPercentage: 0.5,
      categoryPercentage: 0.5
    }
  ]
};

export default function PerformanceChart() {
  return (
    <div style={{ height: '200px', width: '100%' }}>
      <Bar data={data} options={{ ...options, maintainAspectRatio: false }} />
    </div>
  );
}
