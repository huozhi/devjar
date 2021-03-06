import Head from 'next/head'
import '../styles.css'

const imgUrl = 'https://repository-images.githubusercontent.com/483779830/28347c03-774a-4766-b113-54041fad1e72'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>devjar</title>
        <meta property="og:title" content="devjar" />
        <meta property="og:description" content="live code runtime for your react project in browser" />
        <meta property="og:image" content={imgUrl} />
        <meta name="twitter:image" content={imgUrl} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
