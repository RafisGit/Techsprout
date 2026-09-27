import testimonialImg1 from '@/assets/img/testimonial/testimonial01.png';
import testimonialImg2 from '@/assets/img/testimonial/testimonial02.png';
import brand1 from '@/assets/img/brands/brand01.png';
import brand2 from '@/assets/img/brands/brand02.png';
import brand3 from '@/assets/img/brands/brand03.png';
import brand4 from '@/assets/img/brands/brand04.png';
import brand5 from '@/assets/img/brands/brand05.png';
import brand6 from '@/assets/img/brands/brand06.png';
import brand8 from '@/assets/img/brands/brand08.png';
import brand9 from '@/assets/img/brands/brand09.png';
import {
  User,
  Course,
  FAQ,
  Enrolment,
  Review,
  Blog,
  Cart,
  Order,
  Question,
  Instructor,
  Subscriber,
  Testimonial,
} from './mockDataTypes';
import courseImg1 from '@/assets/img/courses/courses03.jpg';
import courseImg2 from '@/assets/img/courses/courses05.jpg';
import courseImg3 from '@/assets/img/courses/courses06.jpg';
import courseImg4 from '@/assets/img/courses/courses10.jpg';
import instructor1 from '@/assets/img/instructors/instructor01.png';
import instructor2 from '@/assets/img/instructors/instructor02.png';
import instructor3 from '@/assets/img/instructors/instructor03.png';
import instructor4 from '@/assets/img/instructors/instructor04.png';
import blogImg1 from '@/assets/img/blogs/blog_standard01.jpg';
import blogImg2 from '@/assets/img/blogs/blog_standard02.jpg';
import blogImg3 from '@/assets/img/blogs/blog_standard03.jpg';
import { GraduationCap, MonitorPlay, NotepadText, UserCheck2 } from 'lucide-react';

// Brands
export const brands = [brand1, brand2, brand3, brand4, brand5, brand6, brand8, brand9];

// Testimonials
export const testimonials: Testimonial[] = [
  {
    image: testimonialImg1,
    name: 'Meherin Tonny',
    occupation: 'UI/UX Designer',
    message:
      'Webtricker Web and Design Solution stands out as a modern, professional, and highly user-friendly website dedicated to delivering top-notch web development and design services. From the moment you land on the homepage, you’re greeted with a sleek and responsive.',
  },
  {
    image: testimonialImg2,
    name: 'Shazzad Anik',
    occupation: 'Software Engineer',
    message:
      "Webtricker is a best Web development agency in Bangladesh I have ever  seen. I have learned web development here and now I'm here as a Web developer. Their teaching methods is very well and they teach all of students with a friendly behavior. They are too much helpful.",
  },
];

// Discover section data
export const aboutUsInfo = [
  {
    title: 'expert tutors',
    number: 20,
    icon: UserCheck2,
  },
  {
    title: 'Top Lessons',
    number: 150,
    icon: NotepadText,
  },
  {
    title: 'Over students',
    number: 2000,
    icon: GraduationCap,
  },
  {
    title: 'Pro videos',
    number: 100,
    icon: MonitorPlay,
  },
];

// Users
export const users: User[] = [
  {
    _id: 'u1',
    name: 'Mosaraf Hossain',
    username: 'mosaraf',
    email: 'mosaraf@example.com',
    phone: '01710000001',
    password: 'hashed123',
    occupation: 'CEO and Founder',
    bio: 'CEO/Web Developer',
    socialLinks: ['www.facebook.com', 'www.x.com', 'www.instagram.com', 'www.linkedin.com'],
    image: instructor1.src,
    role: 'top-instructor',
    registeredAt: new Date().toISOString(),
    wishlist: ['c2'],
  },
  {
    _id: 'u2',
    name: 'Abd Al Muktadir',
    username: 'minar',
    email: 'minar@example.com',
    phone: '01710000002',
    password: 'hashed456',
    occupation: 'COO and Digital Marketing',
    bio: 'COO/Digital Marketing',
    socialLinks: ['www.facebook.com', 'www.x.com', 'www.instagram.com', 'www.linkedin.com'],
    image: instructor2.src,
    role: 'top-instructor',
    registeredAt: new Date().toISOString(),
    wishlist: ['c1'],
  },
  {
    _id: 'u3',
    name: 'Md. Tahazzat',
    username: 'frankm',
    email: 'tahazzat@example.com',
    phone: '01710000006',
    password: 'hashed103',
    occupation: 'Full Stack Developer',
    bio: 'Full Stack Developer',
    socialLinks: ['www.facebook.com', 'www.x.com', 'www.instagram.com', 'www.linkedin.com'],
    image: instructor3.src,
    role: 'top-instructor',
    registeredAt: new Date().toISOString(),
    wishlist: ['c6', 'c7'],
  },
  {
    _id: 'u4',
    name: 'Ahadul Islam',
    username: 'ahad',
    email: 'henry@example.com',
    phone: '01710000008',
    password: 'hashed105',
    occupation: 'Full Stack Developer',
    bio: 'Full Stack Developer',
    socialLinks: ['www.facebook.com', 'www.x.com', 'www.instagram.com', 'www.linkedin.com'],
    image: instructor4.src,
    role: 'top-instructor',
    registeredAt: new Date().toISOString(),
    wishlist: ['c9'],
  },
];

// Courses
export const courses: Course[] = [
  {
    _id: 'c1',
    title: 'Unity Game Development',
    category: 'Game Development',
    duration: '12 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg1.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: [
      'https://www.w3schools.com/html/mov_bbb.mp4',
      'https://www.w3schools.com/html/movie.mp4',
    ],
    featured: true,
    instructor: 'u2',
    reviews: ['r1', 'r11', 'r21'],
    enrolments: ['e1', 'e11', 'e21'],
    description:
      "Learn how to build interactive 2D and 3D games using Unity. This beginner-friendly course takes you from installation to creating your first playable level. You'll learn about scenes, physics, assets, and scripting with C#. By the end, you’ll have built your own game and gained the skills to continue exploring advanced Unity features.",
    audience: [
      'Aspiring game developers with no prior experience.',
      'Students who want to explore careers in game design.',
      'Hobbyists who want to create their own games.',
    ],
    requirements: [
      'A computer capable of running Unity.',
      'Basic programming knowledge is helpful but not required.',
      'An internet connection.',
    ],
    resources: [
      'Starter project files and Unity templates.',
      'Downloadable character assets and scenes.',
      'Hands-on coding challenges.',
      'Access to a student game showcase community.',
    ],
    keyLearningPoints: [
      'Understanding the Unity editor and project setup.',
      'Creating 2D and 3D game environments.',
      'Using C# scripts for gameplay logic.',
      'Implementing physics and collisions.',
      'Building and exporting your first playable game.',
    ],
  },
  {
    _id: 'c2',
    title: 'AI with Python: Building Smart Applications',
    category: 'AI Development',
    duration: '20 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg2.src,
    demoVideo: 'https://www.w3schools.com/html/movie.mp4',
    lessons: ['https://www.w3schools.com/html/movie.mp4'],
    featured: false,
    instructor: 'u4',
    reviews: ['r2', 'r12', 'r22'],
    enrolments: ['e2', 'e12', 'e22'],
    description:
      'Step into the world of artificial intelligence with this Python-based course. You’ll learn the fundamentals of machine learning, neural networks, and natural language processing. Through projects, you’ll train models, analyze data, and build AI-driven applications. By the end, you’ll have the skills to start building real-world AI solutions.',
    audience: [
      'Developers interested in AI and machine learning.',
      'Students studying computer science or data science.',
      'Tech enthusiasts who want to explore AI development.',
    ],
    requirements: [
      'Basic knowledge of Python programming.',
      'A computer with Python installed.',
      'An internet connection.',
    ],
    resources: [
      'Datasets for training and testing AI models.',
      'Code templates for machine learning projects.',
      'Video tutorials on neural networks.',
      'Community forum for Q&A and collaboration.',
    ],
    keyLearningPoints: [
      'Understanding AI fundamentals and terminology.',
      'Using Python libraries like TensorFlow and scikit-learn.',
      'Building and training machine learning models.',
      'Implementing natural language processing basics.',
      'Developing AI-powered applications.',
    ],
  },
  {
    _id: 'c3',
    title: 'Arduino Robotics for Beginners',
    category: 'Robotics',
    duration: '15 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg3.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: ['https://www.w3schools.com/html/mov_bbb.mp4'],
    featured: true,
    instructor: 'u1',
    reviews: ['r3', 'r13', 'r23'],
    enrolments: ['e3', 'e13', 'e23'],
    description:
      "Dive into robotics with this hands-on course using Arduino. Learn how to control motors, sensors, and servos to bring your robots to life. You'll build small robotic projects and gain the knowledge to create more advanced robots in the future. A perfect entry point for robotics enthusiasts and students.",
    audience: [
      'Students interested in robotics and electronics.',
      'Hobbyists who want to build DIY robots.',
      'Educators looking to teach robotics basics.',
    ],
    requirements: [
      'An Arduino starter kit.',
      'Basic knowledge of electronics is helpful but not required.',
      'A computer with Arduino IDE installed.',
    ],
    resources: [
      'Step-by-step Arduino project guides.',
      'Circuit diagrams and code snippets.',
      'Community projects for inspiration.',
      'Downloadable resource packs.',
    ],
    keyLearningPoints: [
      'Understanding Arduino and microcontroller basics.',
      'Connecting and programming sensors.',
      'Controlling motors and servos.',
      'Building simple robotic projects.',
      'Expanding knowledge for advanced robotics applications.',
    ],
  },
  {
    _id: 'c4',
    title: 'Flutter App Development',
    category: 'App Development',
    duration: '18 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg4.src,
    demoVideo: 'https://www.w3schools.com/html/movie.mp4',
    lessons: ['https://www.w3schools.com/html/movie.mp4'],
    featured: false,
    instructor: 'u3',
    reviews: ['r4', 'r14', 'r24'],
    enrolments: ['e4', 'e14', 'e24'],
    description:
      "Learn to build cross-platform mobile apps with Flutter and Dart. This course covers everything from setting up your development environment to publishing your first app. You'll design beautiful interfaces, manage state, and integrate APIs. By the end, you’ll be able to create production-ready Android and iOS apps.",
    audience: [
      'Aspiring app developers.',
      'JavaScript/Java developers who want to explore Flutter.',
      'Entrepreneurs who want to build their own apps.',
    ],
    requirements: [
      'Basic programming knowledge.',
      'A computer with Flutter SDK installed.',
      'An internet connection.',
    ],
    resources: [
      'App project templates.',
      'UI design assets for practice.',
      'Code-along video tutorials.',
      'Community support for troubleshooting.',
    ],
    keyLearningPoints: [
      'Understanding Flutter architecture and Dart programming.',
      'Building responsive mobile UIs.',
      'Handling state management in Flutter.',
      'Integrating APIs and databases.',
      'Publishing apps to Google Play and App Store.',
    ],
  },
  {
    _id: 'c5',
    title: 'Full-Stack Web Development',
    category: 'Web Development',
    duration: '25 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg1.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: ['https://www.w3schools.com/html/mov_bbb.mp4'],
    featured: true,
    instructor: 'u2',
    reviews: ['r5', 'r15', 'r25'],
    enrolments: ['e5', 'e15', 'e25'],
    description:
      'Master both front-end and back-end web development in this comprehensive bootcamp. Learn HTML, CSS, JavaScript, React, Node.js, and MongoDB by building real-world projects. This course takes you from beginner to job-ready full-stack developer with practical, hands-on learning.',
    audience: [
      'Aspiring full-stack developers.',
      'Students who want to build complete web applications.',
      'Freelancers looking to expand their skillset.',
    ],
    requirements: [
      'A computer with a modern web browser.',
      'An internet connection.',
      'A willingness to learn and practice coding.',
    ],
    resources: [
      'Starter code and project files.',
      'Code challenges and quizzes.',
      'Project-based assignments.',
      'Access to a developer support community.',
    ],
    keyLearningPoints: [
      'Mastering front-end development with HTML, CSS, and JavaScript.',
      'Building dynamic UIs with React.',
      'Developing back-end APIs with Node.js and Express.',
      'Working with databases using MongoDB.',
      'Deploying full-stack apps to the cloud.',
    ],
  },
  {
    _id: 'c6',
    title: 'Unreal Engine Game Design',
    category: 'Game Development',
    duration: '22 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg2.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: [
      'https://www.w3schools.com/html/mov_bbb.mp4',
      'https://www.w3schools.com/html/movie.mp4',
    ],
    featured: true,
    instructor: 'u4',
    reviews: ['r6', 'r16', 'r26'],
    enrolments: ['e6', 'e16', 'e26'],
    description:
      'Step into professional-grade game development with Unreal Engine. This course teaches you how to design levels, create environments, and use Blueprints for gameplay mechanics. With hands-on projects, you’ll learn how to build both 3D and VR experiences in one of the most powerful game engines available.',
    audience: [
      'Game designers and developers.',
      'Students who want to learn Unreal Engine.',
      'Developers interested in VR/AR experiences.',
    ],
    requirements: [
      'A computer capable of running Unreal Engine.',
      'Basic programming knowledge is recommended.',
      'An internet connection.',
    ],
    resources: [
      'Level design project files.',
      'Blueprint scripting examples.',
      'VR/AR project templates.',
      'Case studies of Unreal Engine games.',
    ],
    keyLearningPoints: [
      'Mastering the Unreal Engine interface.',
      'Designing 3D levels and environments.',
      'Using Blueprints for scripting.',
      'Implementing physics and materials.',
      'Creating VR/AR projects in Unreal Engine.',
    ],
  },
  {
    _id: 'c7',
    title: 'AI-Powered Chatbot Development',
    category: 'AI Development',
    duration: '16 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg1.src,
    demoVideo: 'https://www.w3schools.com/html/movie.mp4',
    lessons: ['https://www.w3schools.com/html/movie.mp4'],
    featured: false,
    instructor: 'u3',
    reviews: ['r7', 'r17', 'r27'],
    enrolments: ['e7', 'e17', 'e27'],
    description:
      'Build intelligent chatbots using AI and natural language processing. This course covers chatbot architecture, training conversational models, and integrating them into apps or websites. By the end, you’ll have built a fully functional AI chatbot capable of holding human-like conversations.',
    audience: [
      'Developers interested in conversational AI.',
      'Businesses looking to automate customer support.',
      'Students learning NLP and AI applications.',
    ],
    requirements: [
      'Basic programming knowledge.',
      'Familiarity with Python is helpful.',
      'An internet connection.',
    ],
    resources: [
      'Pre-trained chatbot models.',
      'Datasets for training conversational AI.',
      'Project templates for integration.',
      'Community forum for AI chatbot discussions.',
    ],
    keyLearningPoints: [
      'Understanding chatbot architecture.',
      'Training AI models with NLP techniques.',
      'Integrating chatbots into apps and websites.',
      'Handling intents, entities, and context.',
      'Building production-ready conversational AI.',
    ],
  },
  {
    _id: 'c8',
    title: 'Robotics with Raspberry Pi',
    category: 'Robotics',
    duration: '14 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg2.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: ['https://www.w3schools.com/html/mov_bbb.mp4'],
    featured: true,
    instructor: 'u1',
    reviews: ['r8', 'r18', 'r28'],
    enrolments: ['e8', 'e18', 'e28'],
    description:
      'Learn to build and program robots using Raspberry Pi. This free course introduces sensors, motors, and Python programming for robotics projects. You’ll create practical robots like line followers and obstacle avoiders, gaining hands-on experience in both hardware and software.',
    audience: [
      'Beginners in robotics.',
      'Students exploring STEM projects.',
      'Hobbyists who want to build Raspberry Pi robots.',
    ],
    requirements: [
      'A Raspberry Pi board.',
      'Basic knowledge of Python.',
      'An internet connection.',
    ],
    resources: [
      'Circuit diagrams and schematics.',
      'Python scripts for robotics projects.',
      'Step-by-step assembly guides.',
      'Community for robotics project sharing.',
    ],
    keyLearningPoints: [
      'Getting started with Raspberry Pi for robotics.',
      'Programming sensors and motors.',
      'Building simple robotic prototypes.',
      'Integrating hardware and software.',
      'Expanding into IoT and AI robotics.',
    ],
  },
  {
    _id: 'c9',
    title: 'iOS App Development with Swift',
    category: 'App Development',
    duration: '20 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg3.src,
    demoVideo: 'https://www.w3schools.com/html/movie.mp4',
    lessons: ['https://www.w3schools.com/html/movie.mp4'],
    featured: false,
    instructor: 'u2',
    reviews: ['r9', 'r19', 'r29'],
    enrolments: ['e9', 'e19', 'e29'],
    description:
      'Become an iOS app developer by learning Swift and Xcode. This course teaches you how to design user interfaces, handle user input, and work with APIs to build powerful iOS applications. By the end, you’ll be able to publish your apps on the App Store.',
    audience: [
      'Aspiring iOS developers.',
      'Students who want to learn Swift.',
      'Entrepreneurs building apps for iOS.',
    ],
    requirements: [
      'A Mac computer with Xcode installed.',
      'Basic programming knowledge.',
      'An internet connection.',
    ],
    resources: [
      'Xcode project templates.',
      'UI design kits.',
      'Code snippets for common app features.',
      'Community for iOS developer support.',
    ],
    keyLearningPoints: [
      'Learning Swift programming.',
      'Designing UIs with Storyboards and SwiftUI.',
      'Handling APIs and data persistence.',
      'Debugging and testing iOS apps.',
      'Publishing apps to the App Store.',
    ],
  },
  {
    _id: 'c10',
    title: 'Next.js Web Development',
    category: 'Web Development',
    duration: '28 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg4.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: [
      'https://www.w3schools.com/html/mov_bbb.mp4',
      'https://www.w3schools.com/html/movie.mp4',
    ],
    featured: true,
    instructor: 'u4',
    reviews: ['r10', 'r20', 'r30'],
    enrolments: ['e10', 'e20', 'e30'],
    description:
      'Master modern web development with Next.js. This course covers server-side rendering, static site generation, API routes, and full-stack capabilities. With real projects, you’ll build scalable, SEO-friendly applications and deploy them with ease.',
    audience: [
      'Front-end developers who want to master Next.js.',
      'Students interested in full-stack development.',
      'Businesses looking for SEO-friendly web apps.',
    ],
    requirements: [
      'Basic knowledge of React and JavaScript.',
      'A computer with Node.js installed.',
      'An internet connection.',
    ],
    resources: [
      'Next.js starter templates.',
      'Project-based assignments.',
      'Code-along tutorials.',
      'Community support for debugging.',
    ],
    keyLearningPoints: [
      'Understanding Next.js fundamentals.',
      'Implementing server-side rendering and static site generation.',
      'Creating API routes with Next.js.',
      'Building full-stack apps with MongoDB and Next.js.',
      'Deploying Next.js apps to production.',
    ],
  },
  {
    _id: 'c11',
    title: 'Modern Web Design',
    category: 'Web Design',
    duration: '24 hours',
    price: 1000,
    isFree: false,
    thumbnail: courseImg3.src,
    demoVideo: 'https://www.w3schools.com/html/mov_bbb.mp4',
    lessons: [
      'https://www.w3schools.com/html/mov_bbb.mp4',
      'https://www.w3schools.com/html/movie.mp4',
    ],
    featured: true,
    instructor: 'u2',
    reviews: ['r11', 'r21', 'r31'],
    enrolments: ['e11', 'e21', 'e31'],
    description:
      'Learn the art and science of modern web design. This course teaches layout principles, typography, color theory, and responsive design. You’ll practice creating visually appealing, user-friendly, and mobile-first websites with real-world projects.',
    audience: [
      'Beginners who want to start a career in web design.',
      'Front-end developers looking to improve their design skills.',
      'Students interested in creating personal or business websites.',
    ],
    requirements: [
      'Basic understanding of computers and the internet.',
      'No prior design knowledge required.',
      'A computer with design tools (Figma/Adobe XD/Canva) installed.',
    ],
    resources: [
      'Design templates and wireframes.',
      'Practical assignments and projects.',
      'Access to a curated design resource library.',
      'Community Q&A and peer feedback.',
    ],
    keyLearningPoints: [
      'Understanding web design principles and trends.',
      'Creating responsive and mobile-first layouts.',
      'Mastering typography, color theory, and UI basics.',
      'Prototyping designs using Figma or Adobe XD.',
      'Building aesthetically pleasing and user-friendly websites.',
    ],
  },
];

// Enrolments
export const enrolments: Enrolment[] = [
  { _id: 'e1', user: 'u1', course: 'c1', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e2',
    user: 'u2',
    course: 'c2',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e3', user: 'u3', course: 'c3', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e4',
    user: 'u4',
    course: 'c4',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e5', user: 'u1', course: 'c5', status: 'active', enrolledAt: new Date().toISOString() },
  { _id: 'e6', user: 'u2', course: 'c6', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e7',
    user: 'u3',
    course: 'c7',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e8', user: 'u8', course: 'c8', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e9',
    user: 'u4',
    course: 'c9',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  {
    _id: 'e10',
    user: 'u1',
    course: 'c10',
    status: 'active',
    enrolledAt: new Date().toISOString(),
  },
  // Additional enrollments for multiple per course
  {
    _id: 'e11',
    user: 'u4',
    course: 'c1',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e12', user: 'u5', course: 'c2', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e13',
    user: 'u3',
    course: 'c3',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e14', user: 'u7', course: 'c4', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e15',
    user: 'u2',
    course: 'c5',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e16', user: 'u9', course: 'c6', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e17',
    user: 'u4',
    course: 'c7',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e18', user: 'u1', course: 'c8', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e19',
    user: 'u2',
    course: 'c9',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e20', user: 'u3', course: 'c10', status: 'active', enrolledAt: new Date().toISOString() },
  // Third enrollment for each course
  { _id: 'e21', user: 'u7', course: 'c1', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e22',
    user: 'u1',
    course: 'c2',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e23', user: 'u9', course: 'c3', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e24',
    user: 'u4',
    course: 'c4',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e25', user: 'u1', course: 'c5', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e26',
    user: 'u2',
    course: 'c6',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e27', user: 'u3', course: 'c7', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e28',
    user: 'u4',
    course: 'c8',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
  { _id: 'e29', user: 'u5', course: 'c9', status: 'active', enrolledAt: new Date().toISOString() },
  {
    _id: 'e30',
    user: 'u3',
    course: 'c10',
    status: 'completed',
    enrolledAt: new Date().toISOString(),
  },
];

// Reviews
export const reviews: Review[] = [
  {
    _id: 'r1',
    user: 'u1',
    course: 'c1',
    rating: 5,
    comment:
      'I absolutely loved this course! The instructor explained every concept of JavaScript in a clear and easy-to-understand way. The practical exercises were especially helpful for cementing my knowledge. I highly recommend this to anyone starting their web development journey.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r2',
    user: 'u2',
    course: 'c2',
    rating: 4,
    comment:
      'The explanations in this course were great and very thorough. I found the sections on advanced selectors and Sass to be particularly valuable for my workflow. It would have been even better with more examples of real-world project applications.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r3',
    user: 'u3',
    course: 'c3',
    rating: 3,
    comment:
      'This course was a good starting point for learning React, but it felt a little too basic for someone with some prior programming knowledge. I would have appreciated more complex examples and a deeper dive into modern hooks and state management.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r4',
    user: 'u4',
    course: 'c4',
    rating: 4,
    comment:
      'The course was well-structured and provided a solid introduction to data visualization principles. The examples were easy to follow, but I wish there were more diverse datasets to work with throughout the projects.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r5',
    user: 'u1',
    course: 'c5',
    rating: 5,
    comment:
      'This course is absolutely perfect for beginners who want to get started with Node.js. The crash course format was highly effective, and I felt confident building my first server by the end of it. The instructor made a complex topic seem very approachable.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r6',
    user: 'u6',
    course: 'c6',
    rating: 4,
    comment:
      'Docker made easy! I had been intimidated by containerization, but this course broke down the concepts in a way that was simple to grasp. The hands-on labs were excellent for learning how to build and manage my own images.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r7',
    user: 'u2',
    course: 'c7',
    rating: 5,
    comment:
      'This is a truly comprehensive marketing guide that covers all the essential channels. I learned a lot about creating a cohesive strategy that integrates social media, email, and content marketing. Highly recommended for any small business owner.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r8',
    user: 'u3',
    course: 'c8',
    rating: 4,
    comment:
      'Great for mobile development! The course gave a fantastic overview of both React Native and Flutter. It provided a clear path for a web developer like myself to transition into building mobile applications. I’m excited to apply what I learned.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r9',
    user: 'u4',
    course: 'c9',
    rating: 3,
    comment:
      'The course provided a solid foundation in testing, but it could have benefited from more advanced topics like test automation frameworks. The introduction to unit and integration testing was helpful, but I was looking for a little more depth.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r10',
    user: 'u1',
    course: 'c10',
    rating: 5,
    comment:
      'This was an excellent machine learning course! The instructor did a phenomenal job of explaining complex algorithms with Python. The projects were challenging yet rewarding, and I feel much more confident in my ability to build my own models.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  // Additional reviews for multiple per course
  {
    _id: 'r11',
    user: 'u4',
    course: 'c1',
    rating: 4,
    comment:
      'The clear and concise JavaScript tutorial was exactly what I needed. It covered all the core concepts without getting bogged down in unnecessary details. The pace was perfect for a quick refresher or for someone with no prior experience.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r12',
    user: 'u4',
    course: 'c2',
    rating: 5,
    comment:
      'The CSS animations section was absolutely amazing and taught me so many new techniques. This course really pushed me to think about styling in a more creative and efficient way. My websites look so much more professional now!',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r13',
    user: 'u3',
    course: 'c3',
    rating: 4,
    comment:
      'A really good introduction to React. It’s perfect for getting your feet wet with the library. While it didn’t cover everything, it gave me a strong enough foundation to start building my own projects and exploring the documentation on my own.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r14',
    user: 'u2',
    course: 'c4',
    rating: 5,
    comment:
      'This course on data visualization taught me how to create beautiful and compelling visualizations. The hands-on projects were fantastic for understanding how to present data in a meaningful way. It was a very practical and engaging course.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r15',
    user: 'u4',
    course: 'c5',
    rating: 4,
    comment:
      'The solid Node.js fundamentals taught in this course were exactly what I was looking for. It covered the core concepts of asynchronous programming and Express.js very well, giving me a strong base to build upon for my backend projects.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r16',
    user: 'u2',
    course: 'c6',
    rating: 5,
    comment:
      'The container concepts were so well explained in this course. It demystified Docker for me, and I now understand how to use it to create consistent development environments. A must-take course for anyone in DevOps or backend development.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r17',
    user: 'u1',
    course: 'c7',
    rating: 4,
    comment:
      'The practical marketing strategies in this course were very useful and actionable. I particularly enjoyed the sections on content and email marketing. The course gives a solid framework for creating and executing a digital strategy.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r18',
    user: 'u1',
    course: 'c8',
    rating: 5,
    comment:
      'Mobile development made simple! This course gave me the confidence to start building mobile apps. It provided a clear comparison between the different frameworks and a straightforward path for getting started with my projects. Great value for a free course.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r19',
    user: 'u2',
    course: 'c9',
    rating: 4,
    comment:
      'This course offered comprehensive testing coverage, from manual to automated methods. I particularly enjoyed the section on test-driven development. It gave me a new perspective on how to write more robust and bug-free code from the beginning.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r20',
    user: 'u3',
    course: 'c10',
    rating: 5,
    comment:
      "This is the best machine learning course I've taken! The hands-on projects and the instructor's clear explanations of complex mathematical concepts were outstanding. I feel well-prepared to tackle real-world ML problems after completing this program.",
    featured: true,
    createdAt: new Date().toISOString(),
  },
  // Third review for each course
  {
    _id: 'r21',
    user: 'u3',
    course: 'c1',
    rating: 3,
    comment:
      'The course is good for absolute beginners, but I was hoping for more advanced topics beyond the basics of JavaScript. It serves its purpose as an introduction, but I need to look elsewhere for more in-depth knowledge.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r22',
    user: 'u2',
    course: 'c2',
    rating: 4,
    comment:
      'The Flexbox and Grid sections were excellent and incredibly helpful. I feel much more confident in my ability to create complex and responsive layouts now. The course covered these topics thoroughly with great examples.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r23',
    user: 'u2',
    course: 'c3',
    rating: 5,
    comment:
      'This free course has premium quality content! The instruction was top-notch, and the curriculum was well-designed for a beginner. I was surprised by how much I learned without having to pay a single dollar. A truly fantastic resource.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r24',
    user: 'u1',
    course: 'c4',
    rating: 4,
    comment:
      'The D3.js examples were particularly helpful for understanding how to create custom data visualizations. The course provided a great mix of theoretical knowledge and practical application, which made learning much more effective.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r25',
    user: 'u1',
    course: 'c5',
    rating: 5,
    comment:
      'The Express.js tutorial was spot on. The course covered setting up a server and building APIs in a very clear and logical manner. I highly recommend this for anyone wanting to get a strong start in Node.js backend development.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r26',
    user: 'u2',
    course: 'c6',
    rating: 4,
    comment:
      'This is a good Docker fundamentals course. It covered all the basic commands and concepts needed to start using Docker in a development environment. I feel like I have a good grasp on the essentials now and can build on this knowledge.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r27',
    user: 'u3',
    course: 'c7',
    rating: 5,
    comment:
      'The SEO strategies taught in this course really work! I applied some of the techniques to my own website, and I’m already seeing a significant increase in organic traffic. This course is a must for anyone serious about digital marketing.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r28',
    user: 'u4',
    course: 'c8',
    rating: 4,
    comment:
      'Both React Native and Flutter were covered well in this course, which gave me a great perspective on cross-platform development. The instructor did a fantastic job of explaining the pros and cons of each framework.',
    featured: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r29',
    user: 'u1',
    course: 'c9',
    rating: 5,
    comment:
      'The section on automation testing tools was great. The course provided practical examples and a clear guide on how to integrate testing into my development workflow. I feel much more confident in writing automated tests now.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'r30',
    user: 'u2',
    course: 'c10',
    rating: 5,
    comment:
      'The hands-on ML projects were fantastic and really solidified my understanding of the concepts. This course is not just theory; it’s about practical application. I feel equipped to build my own machine learning models from scratch.',
    featured: true,
    createdAt: new Date().toISOString(),
  },
];

// Blogs
export const blogs: Blog[] = [
  {
    _id: 'b1',
    title: 'The Rise of Indie Game Development: Creativity Without Limits',
    image: blogImg1.src,
    content: `Indie game development has exploded in recent years, empowering small teams and even solo developers to create groundbreaking games. With tools like Unity and Unreal Engine offering free or affordable licenses, barriers to entry have never been lower. Indie devs thrive on creativity, often experimenting with unique mechanics, art styles, and storytelling approaches that large studios avoid due to financial risks. Digital platforms like Steam and itch.io give indie games direct access to players worldwide. Crowdfunding and early access models also provide funding opportunities that were unimaginable a decade ago. This democratization of game creation has led to masterpieces like Hollow Knight, Celeste, and Stardew Valley. The key to indie success isn’t massive budgets but passion, innovation, and community engagement.`,
    quote:
      'Indie game development proves that passion and creativity can rival massive studio budgets.',
    category: 'Game Development',
    tags: ['games', 'unity', 'unreal', 'indie', 'development'],
    author: 'u1',
    createdAt: new Date('2025-07-01T10:00:00Z').toISOString(),
    comments: [
      {
        user: 'u2',
        comment:
          'So true! Indie games are pushing the industry forward in ways big studios often don’t.',
        createdAt: new Date('2025-07-01T11:00:00Z').toISOString(),
      },
    ],
    keyPoints: [
      'Indie developers rely on creativity rather than big budgets.',
      'Tools like Unity and Unreal have lowered barriers to entry.',
      'Digital platforms give small studios direct access to players.',
      'Crowdfunding supports independent projects.',
      'Community engagement is key for indie success.',
    ],
  },
  {
    _id: 'b2',
    title: 'AI Agents in Gaming: Smarter NPCs for Immersive Worlds',
    image: blogImg2.src,
    content: `Artificial Intelligence is transforming how games feel and respond to players. Gone are the days of predictable NPC patterns—AI agents powered by machine learning can now adapt to player behavior, creating more immersive experiences. Games like Middle-earth: Shadow of Mordor introduced the Nemesis System, where AI remembers past encounters, while modern experiments push towards NPCs with near-human conversations. AI isn’t only for gameplay; it also helps developers generate environments, animations, and even storylines. As these systems mature, the boundary between scripted design and emergent gameplay continues to blur.`,
    quote: 'AI is giving games a new dimension: characters that learn, adapt, and feel alive.',
    category: 'AI Development',
    tags: ['ai', 'gaming', 'npc', 'machine-learning'],
    author: 'u2',
    createdAt: new Date('2025-07-05T14:30:00Z').toISOString(),
    comments: [
      {
        user: 'u1',
        comment: 'Can’t wait until every RPG has AI-driven characters like this!',
        createdAt: new Date('2025-07-05T15:00:00Z').toISOString(),
      },
    ],
    keyPoints: [
      'AI enables smarter, adaptive NPCs.',
      'Machine learning adds unpredictability to gameplay.',
      'Procedural generation creates new environments.',
      'Storytelling can be enhanced with AI-driven narratives.',
      'Immersion increases as NPCs “remember” player actions.',
    ],
  },
  {
    _id: 'b3',
    title: 'Robotics and AI: The Future of Autonomous Machines',
    image: blogImg3.src,
    content: `The fusion of robotics and AI is ushering in a new era of autonomous machines capable of learning, adapting, and performing complex tasks. From self-driving cars to warehouse automation robots, the applications are endless. Advances in computer vision allow robots to perceive and navigate real-world environments, while reinforcement learning enables them to improve through trial and error. Social robots are also emerging, designed to interact with humans naturally, whether in education, healthcare, or entertainment. As costs decrease and accessibility increases, robotics is moving beyond factories into everyday life.`,
    quote: 'Robotics powered by AI is bridging the gap between science fiction and reality.',
    category: 'Robotics',
    tags: ['robotics', 'ai', 'automation', 'future'],
    author: 'u3',
    createdAt: new Date('2025-07-10T09:00:00Z').toISOString(),
    comments: [],
    keyPoints: [
      'AI enables robots to learn and adapt.',
      'Computer vision powers real-world navigation.',
      'Reinforcement learning enhances robotic intelligence.',
      'Social robots are entering homes, schools, and hospitals.',
      'Robotics is expanding beyond factories into daily life.',
    ],
  },
  {
    _id: 'b4',
    title: 'Building Scalable Mobile Apps: Best Practices for Developers',
    image: blogImg1.src,
    content: `App development has evolved far beyond simple utilities. Today, mobile apps must scale to millions of users, handle real-time updates, and provide a seamless user experience. Building such apps requires not just clean code but also careful architecture. Using frameworks like Flutter or React Native allows faster cross-platform development, while cloud services ensure backend scalability. Caching strategies, offline-first designs, and performance optimization are crucial for keeping users engaged. With the growing competition in app stores, user experience and stability are as important as innovation.`,
    quote: 'A successful app balances innovation, performance, and scalability.',
    category: 'App Development',
    tags: ['apps', 'flutter', 'react-native', 'mobile'],
    author: 'u4',
    createdAt: new Date('2025-07-15T11:45:00Z').toISOString(),
    comments: [],
    keyPoints: [
      'Modern apps must scale to millions of users.',
      'Cross-platform frameworks speed up development.',
      'Cloud backends ensure reliability.',
      'Offline-first design improves user experience.',
      'Performance optimization keeps users engaged.',
    ],
  },
  {
    _id: 'b5',
    title: 'Web Development in 2025: The Future of the Frontend',
    image: blogImg2.src,
    content: `Web development continues to evolve at lightning speed. Frameworks like Next.js, Svelte, and Solid are redefining how developers approach performance and user experience. The rise of server-side rendering (SSR) and static site generation (SSG) ensures faster load times, while edge computing brings data closer to users. Accessibility and security are also top priorities, with web standards focusing on inclusive design and privacy. Progressive Web Apps (PWAs) blur the line between web and native apps, providing offline capabilities and push notifications. The web is no longer just about pages—it’s about delivering app-like experiences.`,
    quote: 'Modern web development is about speed, accessibility, and seamless user experiences.',
    category: 'Web Development',
    tags: ['web', 'frontend', 'nextjs', 'pwa'],
    author: 'u1',
    createdAt: new Date('2025-07-20T08:00:00Z').toISOString(),
    comments: [],
    keyPoints: [
      'Next-gen frameworks prioritize performance.',
      'SSR and SSG improve speed and SEO.',
      'PWAs bring native-like experiences to the web.',
      'Accessibility and security remain key.',
      'Edge computing reduces latency.',
    ],
  },
  {
    _id: 'b6',
    title: 'AI in Game Development: Procedural Worlds and Smarter Enemies',
    image: blogImg3.src,
    content: `Artificial Intelligence has become an essential part of modern game development. AI-powered procedural generation allows developers to create endless, unique worlds, while adaptive difficulty ensures players stay challenged. Enemies can now analyze player strategies and adapt in real-time, preventing repetitive gameplay. AI also streamlines development by auto-generating textures, animations, and soundscapes. The future of game AI isn’t just smarter opponents—it’s entire ecosystems that evolve with the player.`,
    quote: 'AI in games is shifting from scripted patterns to emergent, evolving worlds.',
    category: 'Game Development',
    tags: ['ai', 'gaming', 'procedural', 'game-dev'],
    author: 'u2',
    createdAt: new Date('2025-07-25T16:00:00Z').toISOString(),
    comments: [
      {
        user: 'u8',
        comment: 'This is the future—no two playthroughs will ever be the same.',
        createdAt: new Date('2025-07-25T17:00:00Z').toISOString(),
      },
    ],
    keyPoints: [
      'Procedural generation creates infinite content.',
      'Adaptive difficulty keeps gameplay engaging.',
      'AI can analyze and counter player behavior.',
      'Automation speeds up development pipelines.',
      'Evolving ecosystems redefine immersion.',
    ],
  },
  {
    _id: 'b7',
    title: 'Humanoid Robots: Blurring the Line Between Man and Machine',
    image: blogImg1.src,
    content: `Humanoid robots are rapidly advancing, designed to mimic human behavior, speech, and even emotions. From Sophia by Hanson Robotics to Tesla’s Optimus, these machines aim to work alongside humans in everyday environments. Their applications range from caregiving and hospitality to space exploration. While still in early stages, advancements in natural language processing and motor control are making them increasingly lifelike. Ethical concerns about autonomy and employment remain pressing issues as humanoids edge closer to reality.`,
    quote: 'Humanoid robots represent both technological wonder and ethical challenge.',
    category: 'Robotics',
    tags: ['robotics', 'humanoids', 'ai', 'automation'],
    author: 'u2',
    createdAt: new Date('2025-07-28T10:00:00Z').toISOString(),
    comments: [
      {
        user: 'u1',
        comment: 'Exciting but also scary. The future is here.',
        createdAt: new Date('2025-07-28T11:00:00Z').toISOString(),
      },
    ],
    keyPoints: [
      'Humanoid robots mimic human form and behavior.',
      'They are designed for caregiving, service, and exploration.',
      'Advances in NLP and motor control make them lifelike.',
      'Ethical concerns grow as autonomy increases.',
      'Humanoids blur the line between tool and companion.',
    ],
  },
  {
    _id: 'b8',
    title: 'Cross-Platform Development: Flutter vs React Native in 2025',
    image: blogImg2.src,
    content: `Cross-platform frameworks dominate mobile app development, with Flutter and React Native leading the race. Flutter, backed by Google, is praised for its performance and customizable UI components. React Native, backed by Meta, leverages JavaScript and has a massive ecosystem. Both allow teams to ship apps faster while maintaining native performance. The choice often comes down to team expertise and project needs. As both ecosystems evolve, hybrid apps are becoming nearly indistinguishable from fully native solutions.`,
    quote: 'The debate isn’t about which is better—it’s about which fits your project best.',
    category: 'App Development',
    tags: ['flutter', 'react-native', 'mobile', 'apps'],
    author: 'u4',
    createdAt: new Date('2025-07-30T13:00:00Z').toISOString(),
    comments: [],
    keyPoints: [
      'Flutter offers customizable widgets and high performance.',
      'React Native integrates well with existing JS knowledge.',
      'Both frameworks speed up mobile development.',
      'Project scope and team skills determine the choice.',
      'Hybrid apps rival native performance today.',
    ],
  },
  {
    _id: 'b9',
    title: 'The Next Web Revolution: WebAssembly and Beyond',
    image: blogImg1.src,
    content: `WebAssembly (Wasm) is unlocking new possibilities for web development by allowing languages like C++, Rust, and Go to run in the browser at near-native speed. This technology enables performance-heavy applications such as 3D graphics, video editing, and even games to run seamlessly on the web. Combined with modern JavaScript frameworks, Wasm is bridging the gap between native and web apps. As adoption grows, developers will have more freedom to choose the right tools without being constrained by browser limitations.`,
    quote:
      'WebAssembly is redefining what the web can do—turning browsers into powerful app platforms.',
    category: 'Web Development',
    tags: ['web', 'wasm', 'rust', 'performance'],
    author: 'u3',
    createdAt: new Date('2025-08-01T15:00:00Z').toISOString(),
    comments: [
      {
        user: 'u2',
        comment: 'Wasm feels like the future of the browser!',
        createdAt: new Date('2025-08-01T16:00:00Z').toISOString(),
      },
    ],
    keyPoints: [
      'Wasm allows non-JS languages to run in the browser.',
      'Near-native performance makes heavy apps possible.',
      'It expands web use cases into gaming and editing.',
      'Combines with JS frameworks for hybrid solutions.',
      'Removes many old browser limitations.',
    ],
  },
  {
    _id: 'b10',
    title: 'AI and Robotics in Healthcare: Saving Lives with Technology',
    image: blogImg1.src,
    content: `AI and robotics are reshaping healthcare, from robotic-assisted surgeries to AI-powered diagnostic tools. Robotic arms offer precision beyond human capability, reducing surgery risks and recovery times. AI models trained on vast datasets can detect diseases earlier than traditional methods. Rehabilitation robots help patients regain movement, while AI chatbots assist with mental health support. As integration grows, these technologies promise more accessible, efficient, and personalized healthcare—though regulation and ethics remain key challenges.`,
    quote:
      'The fusion of AI and robotics is revolutionizing medicine with precision, speed, and accessibility.',
    category: 'AI Development',
    tags: ['ai', 'robotics', 'healthcare', 'innovation'],
    author: 'u2',
    createdAt: new Date('2025-08-03T09:30:00Z').toISOString(),
    comments: [
      {
        user: 'u3',
        comment: 'The possibilities in healthcare are endless—this is just the beginning.',
        createdAt: new Date('2025-08-03T10:30:00Z').toISOString(),
      },
    ],
    keyPoints: [
      'Robotics improves precision in surgeries.',
      'AI detects diseases earlier than humans.',
      'Rehabilitation robots aid recovery.',
      'AI assists with personalized patient care.',
      'Ethics and regulation are major hurdles.',
    ],
  },
];

// Carts
export const carts: Cart[] = [
  { _id: 'cart1', user: 'u1', items: [{ course: 'c1', price: 29.99 }], totalAmount: 29.99 },
  { _id: 'cart2', user: 'u2', items: [{ course: 'c2', price: 39.99 }], totalAmount: 39.99 },
  { _id: 'cart3', user: 'u3', items: [{ course: 'c4', price: 59.99 }], totalAmount: 59.99 },
  { _id: 'cart4', user: 'u4', items: [{ course: 'c5', price: 19.99 }], totalAmount: 19.99 },
  { _id: 'cart5', user: 'u1', items: [], totalAmount: 0 },
  { _id: 'cart6', user: 'u2', items: [{ course: 'c6', price: 34.99 }], totalAmount: 34.99 },
  { _id: 'cart7', user: 'u3', items: [{ course: 'c7', price: 49.99 }], totalAmount: 49.99 },
  {
    _id: 'cart8',
    user: 'u4',
    items: [
      { course: 'c8', price: 0 },
      { course: 'c9', price: 24.99 },
    ],
    totalAmount: 24.99,
  },
  { _id: 'cart9', user: 'u2', items: [{ course: 'c9', price: 24.99 }], totalAmount: 24.99 },
  { _id: 'cart10', user: 'u1', items: [{ course: 'c10', price: 79.99 }], totalAmount: 79.99 },
];

// Orders
export const orders: Order[] = [
  {
    _id: 'o1',
    user: 'u1',
    courses: ['c1', 'c2'],
    totalAmount: 69.98,
    orderedAt: new Date().toISOString(),
  },
  { _id: 'o2', user: 'u2', courses: ['c3'], totalAmount: 0, orderedAt: new Date().toISOString() },
  {
    _id: 'o3',
    user: 'u3',
    courses: ['c4'],
    totalAmount: 59.99,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o4',
    user: 'u4',
    courses: ['c5'],
    totalAmount: 19.99,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o5',
    user: 'u1',
    courses: ['c1', 'c3', 'c5'],
    totalAmount: 49.98,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o6',
    user: 'u2',
    courses: ['c6'],
    totalAmount: 34.99,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o7',
    user: 'u7',
    courses: ['c7', 'c8'],
    totalAmount: 49.99,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o8',
    user: 'u4',
    courses: ['c8', 'c9'],
    totalAmount: 24.99,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o9',
    user: 'u3',
    courses: ['c9', 'c1'],
    totalAmount: 54.98,
    orderedAt: new Date().toISOString(),
  },
  {
    _id: 'o10',
    user: 'u1',
    courses: ['c10'],
    totalAmount: 79.99,
    orderedAt: new Date().toISOString(),
  },
];

// Questions
export const questions: Question[] = [
  {
    _id: 'q1',
    user: 'u1',
    course: 'c1',
    question: 'Is this updated for ES6?',
    answer: 'Yes.',
    status: 'read',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q2',
    user: 'u2',
    course: 'c2',
    question: 'Will flexbox be covered?',
    answer: 'Definitely.',
    status: 'important',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q3',
    user: 'u3',
    course: 'c3',
    question: 'Any assignments?',
    answer: 'Yes.',
    status: 'read',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q4',
    user: 'u4',
    course: 'c4',
    question: 'What libraries are used?',
    answer: 'Chart.js and D3.',
    status: 'archived',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q5',
    user: 'u3',
    course: 'c5',
    question: 'Do I need Node installed?',
    answer: 'Yes.',
    status: 'unread',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q6',
    user: 'u2',
    course: 'c6',
    question: 'What Docker version is required?',
    answer: 'Docker 20.10 or higher.',
    status: 'read',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q7',
    user: 'u4',
    course: 'c7',
    question: 'Are there practical marketing exercises?',
    answer: 'Yes, lots of hands-on activities.',
    status: 'important',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q8',
    user: 'u2',
    course: 'c8',
    question: 'Which mobile platforms are covered?',
    answer: 'Both iOS and Android.',
    status: 'read',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q9',
    user: 'u1',
    course: 'c9',
    question: 'What testing tools are taught?',
    answer: 'Jest, Cypress, and Selenium.',
    status: 'unread',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'q10',
    user: 'u2',
    course: 'c10',
    question: 'Is Python knowledge required?',
    answer: 'Basic Python knowledge is helpful.',
    status: 'archived',
    createdAt: new Date().toISOString(),
  },
];

// Instructors
export const instructors: Instructor[] = [
  {
    _id: 'i1',
    user: 'u2',
    expertise: ['JavaScript', 'Node.js'],
    isTop: true,
  },
  {
    _id: 'i2',
    user: 'u3',
    expertise: ['Data Science', 'Python'],
    isTop: false,
  },
  {
    _id: 'i3',
    user: 'u4',
    expertise: ['React', 'Frontend'],
    isTop: true,
  },
  {
    _id: 'i4',
    user: 'u1',
    expertise: ['Project Management', 'Agile'],
    isTop: false,
  },
  {
    _id: 'i5',
    user: 'u2',
    expertise: ['UX', 'Design'],
    isTop: false,
  },
  {
    _id: 'i6',
    user: 'u4',
    expertise: ['DevOps', 'Docker', 'AWS'],
    isTop: true,
  },
  {
    _id: 'i7',
    user: 'u3',
    expertise: ['Digital Marketing', 'SEO', 'Social Media'],
    isTop: false,
  },
  {
    _id: 'i8',
    user: 'u2',
    expertise: ['React Native', 'Flutter', 'Mobile UI'],
    isTop: true,
  },
  {
    _id: 'i9',
    user: 'u2',
    expertise: ['Test Automation', 'Quality Assurance'],
    isTop: false,
  },
  {
    _id: 'i10',
    user: 'u1',
    expertise: ['Machine Learning', 'Python', 'Data Science'],
    isTop: true,
  },
];

// Subscribers
export const subscribers: Subscriber[] = [
  { _id: 's1', email: 'alice@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's2', email: 'bob@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's3', email: 'cathy@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's4', email: 'david@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's5', email: 'eva@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's6', email: 'frank@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's7', email: 'grace@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's8', email: 'henry@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's9', email: 'ivy@newsletter.com', subscribedAt: new Date().toISOString() },
  { _id: 's10', email: 'jack@newsletter.com', subscribedAt: new Date().toISOString() },
];

// FAQ
export const faqs: FAQ[] = [
  {
    question: 'What is the Learn Well System?',
    answer:
      'The Learn Well System is an online learning platform designed to help you master new skills through a combination of expert-led courses, engaging blog content, and a supportive community. Our goal is to provide a flexible and effective learning environment for individuals, teams, and businesses.',
  },
  {
    question: 'What is included in the Standard membership plan?',
    answer:
      'The Standard membership plan includes unlimited access to all of our free courses, as well as our entire library of premium blog content and featured articles. You also get access to our community forums and regular newsletters with learning tips and course recommendations.',
  },
  {
    question: 'How do I choose the right class for me?',
    answer:
      'Choosing the right class depends on your goals. You can start by Browse our course categories like "Web Development," "AI & Data Science," or "Marketing." We recommend reading the course descriptions, which include details on the audience, requirements, and key learning points to help you find the perfect fit for your skill level and interests.',
  },
  {
    question: 'Can I pause my Premium membership plan any time?',
    answer:
      'Yes, you can. We understand that your learning needs can change. You can pause your Premium membership plan at any time from your account settings. When you’re ready to resume, you can reactivate your plan to regain access to all premium features and courses.',
  },
  {
    question: 'How does the Affiliate Program work?',
    answer:
      "Our Affiliate Program allows you to earn a commission by promoting our courses and membership plans. Once you sign up, you’ll receive a unique referral link. When someone subscribes to a plan or purchases a course through your link, you'll earn a percentage of the sale. It's a great way to share your favorite learning resources and get rewarded.",
  },
  {
    question: 'How do you provide services for me?',
    answer:
      'We provide our services through a dedicated online platform accessible via a web browser or our mobile app. Our content is delivered through high-quality video lessons, interactive quizzes, and downloadable resources. We also use community forums and direct messaging to ensure you have a support system throughout your learning journey.',
  },
  {
    question: 'Where can I download the LearnWell app?',
    answer:
      'The LearnWell app is available for download on both the Google Play Store for Android devices and the Apple App Store for iOS devices. Simply search for "LearnWell" in your respective app store to download and start learning on the go.',
  },
  {
    question: 'How did you become the best among others?',
    answer:
      'We strive to be the best by focusing on three core principles: quality, community, and practicality. Our courses are created by industry experts and are regularly updated to stay current. We foster a vibrant community where learners can connect and collaborate. Most importantly, our curriculum is designed to be highly practical, ensuring that the skills you learn can be immediately applied in real-world scenarios.',
  },
];
