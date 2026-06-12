const header = document.querySelector("[data-header]");
const toggle = document.querySelector(".nav-toggle");
const links = document.querySelectorAll(".nav-links a");

toggle?.addEventListener("click", () => {
  const isOpen = header.classList.toggle("nav-open");
  toggle.setAttribute("aria-expanded", String(isOpen));
});

links.forEach((link) => {
  link.addEventListener("click", () => {
    header.classList.remove("nav-open");
    toggle?.setAttribute("aria-expanded", "false");
  });
});

const carousel = document.querySelector("[data-hero-carousel]");
const slides = carousel ? Array.from(carousel.querySelectorAll("img")) : [];
const dots = Array.from(document.querySelectorAll(".hero-carousel-dots button"));
let activeSlide = -1;
let carouselTimer;

const setActiveSlide = (nextSlide) => {
  slides[activeSlide]?.classList.remove("is-active");
  slides[activeSlide]?.setAttribute("aria-hidden", "true");
  dots[activeSlide]?.classList.remove("is-active");
  dots[activeSlide]?.removeAttribute("aria-current");

  activeSlide = nextSlide;

  slides[activeSlide]?.classList.add("is-active");
  slides[activeSlide]?.setAttribute("aria-hidden", "false");
  dots[activeSlide]?.classList.add("is-active");
  dots[activeSlide]?.setAttribute("aria-current", "true");
};

const nextSlide = () => (activeSlide + 1) % slides.length;

const startCarousel = () => {
  carouselTimer = window.setInterval(() => {
    setActiveSlide(nextSlide());
  }, 4800);
};

if (slides.length > 1) {
  slides.forEach((slide) => {
    slide.setAttribute("aria-hidden", "true");
  });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      window.clearInterval(carouselTimer);
      setActiveSlide(index);

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        startCarousel();
      }
    });
  });

  setActiveSlide(0);

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    startCarousel();
  }
} else if (slides.length === 1) {
  setActiveSlide(0);
}

const latestBlogCard = document.querySelector("[data-blog-latest]");

const renderLatestBlogPost = (post) => {
  if (!latestBlogCard || !post) {
    return;
  }

  const kicker = document.createElement("p");
  kicker.className = "blog-kicker";
  kicker.textContent = post.date ? `Latest digest | ${post.date}` : "Latest digest";

  const title = document.createElement("h3");
  title.textContent = (post.title || "Daily AI and tech digest").replace(
    / for \d{4}-\d{2}-\d{2}$/,
    ""
  );

  const summary = document.createElement("p");
  summary.textContent = post.summary || "Fresh AI and tech notes from Transformer Lab.";

  const link = document.createElement("a");
  link.className = "text-link";
  link.href = post.url || "blog/";
  link.textContent = "Read the latest post";

  latestBlogCard.replaceChildren(kicker, title, summary, link);
};

if (latestBlogCard) {
  fetch("blog/data/latest.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("No latest blog post found");
      }

      return response.json();
    })
    .then(renderLatestBlogPost)
    .catch(() => {
      renderLatestBlogPost({
        title: "Daily AI and tech digest",
        summary: "The automated AI and tech digest will appear here after the next scheduled run.",
        url: "blog/"
      });
    });
}
