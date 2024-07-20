# Daniel Howard Dev Blog & Portfolio

This is the code for [my blog & portfolio site](https://danielhoward-dev.netlify.app/).

## Astro

I used [this Astro theme](https://github.com/trevortylerlee/astro-micro/tree/main) as a starting point. [Astro](https://astro.build/) "is the web framework for building content-driven websites like blogs, marketing, and e-commerce. Astro is best-known for pioneering a new frontend architecture to reduce JavaScript overhead and complexity compared to other frameworks. Astro pioneered and popularized a frontend architecture called Islands. Islands architecture results in better frontend performance by helping you avoid monolithic JavaScript patterns and stripping all non-essential JavaScript from the page automatically."

## Running in dev

```
npm run dev
```

## Building

```
npm run build
```

## Deploying

The repo is configured for Netlify deploys with the `astro.config.mjs` and `netlify.toml` files.

## Contributing

Astro has [an opinionated directory structure](https://docs.astro.build/en/basics/project-structure/), which can help guide where to make changes.

- src/components: Components are reusable units of code for your HTML pages. These could be Astro components, or UI framework components like React or Vue. It is common to group and organize all of your project components together in this folder. For example, the `/projects` and `/blog` pages list all of the projects and blogs, rendering the `ArrowCard` component for each entry that has the title and preview blurb. It's a shared component.
- src/content: This directory is reserved to store content collections and an optional collections configuration file (`./src/content/config.ts`). No other files are allowed inside this folder. This is where content lives.
- src/layouts: Layouts are Astro components that define the UI structure shared by one or more pages. For example, the main layout shared across all pages of this theme is what renders the header nav bar and the footer with social media links. The `<slot />` in the template is filled out by the content associated with the client-side route.
- src/pages: Pages are a special kind of component used to create new pages on your site. A page can be an Astro component, or a Markdown file that represents some page of content for your site. Astro uses [file-based routing](https://docs.astro.build/en/basics/astro-pages/#file-based-routing). Take for example the `src/pages/blog` directory and within it an `index.astro` file and the `[...slug.astro]` file. The former creates a page for `/blog`. The latter dereferences the `slug` property from the `params` of the instance of the blog collection and creates a dynamic route for whatever that value is. See more [here](https://docs.astro.build/en/guides/routing/#static-ssg-mode)

### Adding content

To add either a blog or project, follow the patterns for directory structure and markdown file template in the `./src/content/blog` and `./src/content/projects` directories. For blog articles, the directory name is also used as the slug in the url for that article. The metadata in each markdown file corresponds to the collection schema definitions in `./src/content/config.ts`.

## tailwindcss

This app uses [tailwindcss](https://tailwindcss.com/docs/installation) for its styling.