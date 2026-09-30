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
const latestFinanceBanner = document.querySelector("[data-finance-latest]");

const renderLatestPostCard = (card, post, options) => {
  if (!card || !post) {
    return;
  }

  const kicker = document.createElement("p");
  kicker.className = "blog-kicker";
  kicker.textContent = post.date ? `${options.kicker} | ${post.date}` : options.kicker;

  const title = document.createElement("h3");
  title.textContent = (post.title || options.title).replace(
    / for \d{4}-\d{2}-\d{2}$/,
    ""
  );

  const summary = document.createElement("p");
  summary.textContent = post.summary || options.summary;

  const link = document.createElement("a");
  link.className = "text-link";
  link.href = post.url || options.url;
  link.textContent = options.linkText;

  card.replaceChildren(kicker, title, summary, link);
};

if (latestBlogCard) {
  fetch("blog/data/latest.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("No latest blog post found");
      }

      return response.json();
    })
    .then((post) => renderLatestPostCard(latestBlogCard, post, {
      kicker: "Latest digest",
      title: "Daily AI and tech digest",
      summary: "Fresh AI, tech, and research notes with a separate finance banner.",
      url: "blog/",
      linkText: "Read the latest post"
    }))
    .catch(() => {
      renderLatestPostCard(latestBlogCard, {
        title: "Daily AI and tech digest"
      }, {
        kicker: "Latest digest",
        title: "Daily AI and tech digest",
        summary: "The automated AI and tech digest will appear here with a separate finance banner after the next scheduled run.",
        url: "blog/",
        linkText: "View all posts"
      });
    });
}

if (latestFinanceBanner) {
  fetch("blog/data/latest.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("No latest blog post found");
      }

      return response.json();
    })
    .then((post) => {
      const link = latestFinanceBanner.querySelector("a");
      if (link && post.url) {
        link.href = `${post.url}#finance-title`;
      }
    })
    .catch(() => {});
}

const jokes = [
  {
    question: "Why did the AI bring a pencil to the lab?",
    punchline: "It wanted to draw its own conclusions."
  },
  {
    question: "Why was the neural network calm during the exam?",
    punchline: "It had already trained for this."
  },
  {
    question: "Why did the researcher take a ladder to the data center?",
    punchline: "The results were in the cloud."
  },
  {
    question: "What does a computer do after a long day?",
    punchline: "It crashes on the couch."
  },
  {
    question: "Why did the robot join the study group?",
    punchline: "It needed more input."
  },
  {
    question: "Why are debugging jokes so hard to explain?",
    punchline: "The delivery always has a few bugs."
  },
  {
    question: "What did one GPU say to the other?",
    punchline: "You look hot. Need a fan?"
  },
  {
    question: "Why did the statistician bring an umbrella?",
    punchline: "There was a high probability of showers."
  },
  {
    question: "Why did the algorithm cross the road?",
    punchline: "Its objective function was better on the other side."
  },
  {
    question: "Why did the database administrator leave the party early?",
    punchline: "There were too many relationships to manage."
  },
  {
    question: "Why was the HPC cluster so good at teamwork?",
    punchline: "It knew how to share the load."
  },
  {
    question: "What is a machine learning model's favorite snack?",
    punchline: "A byte-sized batch."
  },
  {
    question: "Why did the optimizer skip dessert?",
    punchline: "It had already reached a local minimum."
  },
  {
    question: "Why did the server wear a sweater?",
    punchline: "It was dealing with too many cold starts."
  },
  {
    question: "Why was the function feeling lonely?",
    punchline: "Nobody had called it all day."
  },
  {
    question: "Why did the research paper cross the desk?",
    punchline: "It was ready to go under review."
  },
  {
    question: "Why was the binary tree a great gardener?",
    punchline: "It was always branching out."
  },
  {
    question: "What did the dataset say after spring cleaning?",
    punchline: "I feel normalized."
  },
  {
    question: "Why did the robot arrive exactly on time?",
    punchline: "It followed the schedule to the millisecond."
  },
  {
    question: "Why did the reinforcement learning agent bring treats?",
    punchline: "It believed in positive rewards."
  },
  {
    question: "Why was the matrix invited to every party?",
    punchline: "It added a whole new dimension."
  },
  {
    question: "Why did the code take an afternoon nap?",
    punchline: "It needed a little runtime break."
  },
  {
    question: "Why was the lab's coffee so reliable?",
    punchline: "It kept every experiment grounded."
  },
  {
    question: "Why did the data point leave the group?",
    punchline: "It wanted to be an outlier."
  },
  {
    question: "Why did the language model start a garden?",
    punchline: "It wanted to grow its context."
  },
  {
    question: "Why did the autonomous agent stop for directions?",
    punchline: "Its policy needed an update."
  },
  {
    question: "Why did the time-series analyst love calendars?",
    punchline: "Every date arrived in order."
  },
  {
    question: "Why did the simulation ask for a timeout?",
    punchline: "Reality was catching up."
  },
  {
    question: "Why did the model bring notes to inference?",
    punchline: "It wanted to make a well-prompted decision."
  },
  {
    question: "Why did the parallel program finish the chores early?",
    punchline: "Everyone took a thread."
  },
  {
    question: "Why did the scientist label the empty chart 'promising'?",
    punchline: "There was plenty of room for improvement."
  }
];

const jokeQuestion = document.querySelector("[data-joke-question]");
const jokePunchline = document.querySelector("[data-joke-punchline]");
const jokeDate = document.querySelector("[data-joke-date]");
const nextJokeButton = document.querySelector("[data-joke-next]");

if (jokeQuestion && jokePunchline) {
  const today = new Date();
  const dayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000
  );
  let jokeIndex = dayNumber % jokes.length;

  const showJoke = (index) => {
    jokeQuestion.textContent = jokes[index].question;
    jokePunchline.textContent = jokes[index].punchline;
  };

  showJoke(jokeIndex);

  if (jokeDate) {
    const localDateParts = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ];
    jokeDate.dateTime = localDateParts.join("-");
    jokeDate.textContent = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric"
    }).format(today);
  }

  nextJokeButton?.addEventListener("click", () => {
    jokeIndex = (jokeIndex + 1) % jokes.length;
    showJoke(jokeIndex);
  });
}
