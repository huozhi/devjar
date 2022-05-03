import Head from 'next/head'
import '../styles.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>devjar</title>
      </Head>
      <Component {...pageProps} />
    </>
  )
}
