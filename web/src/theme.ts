import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#F27D26', // Warm orange from Recipe 2
    },
    background: {
      default: '#050505',
      paper: '#151619',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#8E9299',
    },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 100,
          padding: '10px 24px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
        },
      },
    },
  },
});
