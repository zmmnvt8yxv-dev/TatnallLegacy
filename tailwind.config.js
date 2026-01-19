/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class', // Enable class-based dark mode for theme toggle
    theme: {
        extend: {
            colors: {
                // KiltBowl Dark Theme Colors
                'kilt': {
                    'bg': '#1e1e2c',
                    'card': '#2a2a38',
                    'hover': '#353545',
                    'accent': '#4CAF50',
                    'accent-muted': '#4f5b66',
                    'text': '#f0f0f0',
                    'text-secondary': '#999999',
                },
                // Light Theme (current app colors)
                'paper': {
                    '100': '#f7f3ed',
                    '200': '#efe7db',
                },
                'ink': {
                    '900': '#0b1c1c',
                    '700': '#22302e',
                    '500': '#4d5c59',
                    '200': '#e2e7e3',
                },
                'accent': {
                    '700': '#0f766e',
                    '500': '#1f9386',
                    '200': '#b9e2d9',
                },
            },
            fontFamily: {
                'display': ['Space Grotesk', 'Source Sans 3', 'sans-serif'],
                'body': ['Source Sans 3', 'Segoe UI', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                'lg': '18px',
            },
            boxShadow: {
                'soft': '0 18px 40px rgba(11, 28, 28, 0.12)',
                'kilt': '0 4px 10px rgba(0, 0, 0, 0.3)',
            },
        },
    },
    plugins: [],
}
