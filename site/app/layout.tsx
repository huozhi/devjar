import '../styles.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        {children}
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
  title: 'devjar',
  description: 'live code runtime for your react project in browser',
  authors: [{ name: '@huozhi' }],
  openGraph: {
    images: 'https://repository-images.githubusercontent.com/483779830/28347c03-774a-4766-b113-54041fad1e72',
  },
  twitter: {
    card: 'summary_large_image',
    images: 'https://repository-images.githubusercontent.com/483779830/28347c03-774a-4766-b113-54041fad1e72',
  },
}
