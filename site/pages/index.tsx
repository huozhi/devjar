import { Footer } from '../components/footer'
import { DeployDemo } from '../components/deploy-demo'
import { Banner } from '../components/banner'
import { ExampleGallery } from '../components/example-gallery'
import '../styles.css'

const title = 'Devjar — Live Playground & Static Site Export'
const description = 'Live React playgrounds and zero-config static site export.'

export default function Page() {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="author" content="@huozhi" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <link rel="alternate" type="text/plain" title="Devjar agent reference" href="/llms.txt" />
      <main>
        <Banner />

        <div className="playground-container" id="live-demo">
          <div className="playground-wrapper">
            <ExampleGallery />
          </div>
        </div>
        <DeployDemo />
      </main>
      <Footer />
    </>
  )
}
