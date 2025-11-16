import '../styles.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <main>
          <div className="titles">
            <h1>Devjar</h1>
            <h3>Live React Component Previews in Browser</h3>
            <p>
              Devjar empowers you create interactive, real-time React code preview easier. Builtin <b>Tailwind</b> and{' '}
              <b>CSS imports</b> for styling, creating demos that are stylish and eye-catching.
            </p>
            <br />

            <p>
              <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">
                Source Code & Usage ↗
              </a>
            </p>
          </div>

          {children}
        </main>
        <footer>
          <p>
            © {new Date().getFullYear()},{` `}
            <a href={'https://github.com/huozhi'}>Huozhi</a>
          </p>
        </footer>
      </body>
    </html>
  )
}

export const metadata = {
  title: 'Devjar',
  description: 'Live React Component Previews in Browser',
  authors: [{ name: '@huozhi' }],
  openGraph: {
    images: 'https://repository-images.githubusercontent.com/483779830/28347c03-774a-4766-b113-54041fad1e72',
  },
  twitter: {
    card: 'summary_large_image',
    images: 'https://repository-images.githubusercontent.com/483779830/28347c03-774a-4766-b113-54041fad1e72',
  },
}
