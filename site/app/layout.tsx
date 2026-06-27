import '../styles.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <main>
          {children}
        </main>
        <footer>
          <nav aria-label="Footer links">
            <div className="footer-group">
              <span className="footer-label">Project</span>
              <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">
                Devjar repo
              </a>
              <a href="https://github.com/huozhi/devjar/blob/main/API.md" target="_blank" rel="noopener noreferrer">
                API
              </a>
            </div>
            <span className="footer-divider" aria-hidden="true" />
            <div className="footer-group">
              <span className="footer-label">Author</span>
              <a href="https://github.com/huozhi" target="_blank" rel="noopener noreferrer">
                Huozhi
              </a>
              <a href="https://x.com/huozhi" target="_blank" rel="noopener noreferrer">
                X
              </a>
            </div>
          </nav>
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
