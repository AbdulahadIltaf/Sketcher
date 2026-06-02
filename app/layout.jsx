import './globals.css';

export const metadata = {
  title: 'AI Cartoon Character Studio',
  description: 'Draw a creature, pick an artistic theme, and watch your imagination come alive!',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
