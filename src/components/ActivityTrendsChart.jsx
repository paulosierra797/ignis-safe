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
  maintainAspectRatio: false,
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
        stepSize: 100
      }
    },
    x: {
      grid: {
        display: false
      }
    }
  }
};

const data = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  datasets: [
    {
      label: 'Activity 1',
      data: [60, 120, 140, 100, 85, 65, 180, 260, 100, 180, 190, 200],
      backgroundColor: '#f87171',
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.9
    },
    {
      label: 'Activity 2',
      data: [140, 200, 220, 280, 260, 300, 240, 340, 160, 360, 380, 400],
      backgroundColor: '#fbbf24',
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.9
    }
  ]
};

export default function ActivityTrendsChart({ chartData }) {
  const liveData = {
    labels: chartData?.labels?.length ? chartData.labels : data.labels,
    datasets: [
      {
        ...data.datasets[0],
        label: 'Started Attempts',
        data: chartData?.started?.length ? chartData.started : data.datasets[0].data,
      },
      {
        ...data.datasets[1],
        label: 'Submitted Attempts',
        data: chartData?.submitted?.length ? chartData.submitted : data.datasets[1].data,
      },
    ],
  };

  return <Bar data={liveData} options={options} />;
}
