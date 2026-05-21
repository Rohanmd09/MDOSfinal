(() => {
    "use strict";

    const STORAGE_KEY = "lifeos_state_v2_board_sync";
    const SUBJECTS = ["Physics", "Maths", "Further Maths", "Economics", "Accounts", "English", "Projects", "Personal"];
    const DOMAIN_ORDER = ["Academics", "Health", "Projects", "Sleep", "Personal", "Other"];
    const DOMAIN_COLORS = {
        Academics: "#3b82f6",
        Health: "#10b981",
        Projects: "#f59e0b",
        Sleep: "#8b5cf6",
        Personal: "#ec4899",
        Other: "#94a3b8"
    };
    const DOMAIN_TARGETS_WEEKLY = {
        Academics: 30,
        Health: 12,
        Projects: 18,
        Sleep: 56,
        Personal: 12,
        Other: 13
    };
    const STARTUP_LOADER_MS = 5000;
    const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
    const STATUS_LABELS = { todo: "To Do", "in-progress": "In Progress", done: "Done" };
    const STATUS_COLUMNS = { todo: "kanban-todo", "in-progress": "kanban-progress", done: "kanban-done" };
    const SUBJECT_META = {
        Physics: { color: "#22c55e", bg: "rgba(34,197,94,0.16)", icon: "ph-atom" },
        Maths: { color: "#3b82f6", bg: "rgba(59,130,246,0.16)", icon: "ph-function" },
        "Further Maths": { color: "#818cf8", bg: "rgba(129,140,248,0.16)", icon: "ph-sigma" },
        Economics: { color: "#f59e0b", bg: "rgba(245,158,11,0.16)", icon: "ph-chart-line-up" },
        Accounts: { color: "#06b6d4", bg: "rgba(6,182,212,0.16)", icon: "ph-receipt" },
        English: { color: "#f472b6", bg: "rgba(244,114,182,0.16)", icon: "ph-pencil-line" },
        Projects: { color: "#8b5cf6", bg: "rgba(139,92,246,0.16)", icon: "ph-rocket-launch" },
        Personal: { color: "#f43f5e", bg: "rgba(244,63,94,0.16)", icon: "ph-heart" }
    };
    const TOPIC_STATES = ["not-started", "familiar", "confident", "expert"];
    const TOPIC_LABELS = {
        "not-started": "Not Started",
        familiar: "Familiar",
        confident: "Confident",
        expert: "Expert"
    };

    const ui = {
        currentView: "overview",
        taskFilter: "All",
        taskSearch: "",
        editingTaskId: null,
        editingProjectId: null,
        commandOpen: false,
        commandItems: [],
        cmdIndex: 0,
        charts: { focus: null, tasks: null, domain: null },
        sortables: {},
        prioritySortable: null
    };

    let state = loadState();

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        startStartupLoader();
        bindNavigation();
        bindClock();
        bindTaskUi();
        bindFocusUi();
        bindModalUi();
        bindTopicUi();
        bindProjectUi();
        bindHabitUi();
        bindQuickAddUi();
        bindAnalyticsUi();
        bindCommandPalette();
        initKanbanSortables();
        initPrioritySortable();
        applyRunningFocusFromStorage();
        renderAll();
        setInterval(tickFocusTimer, 250);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                tickFocusTimer();
            }
        });
    }

    function createDefaultState() {
        const now = new Date();
        const subjects = createDefaultSubjects(now);
        const tasks = [
            ...createAcademicTasks(subjects, now),
            ...createSupplementalTasks(now)
        ];
        const habits = createDefaultHabits(now);
        const timeBlocks = createDefaultTimeBlocks(now);
        const activityLogs = createDefaultActivityLogs(now);
        return {
            tasks,
            habits,
            timeBlocks,
            activityLogs,
            projects: createDefaultProjects(now),
            subjects,
            focus: {
                modeMinutes: 25,
                remainingSeconds: 1500,
                status: "ready",
                endAt: null,
                sessions: [],
                totalCompletedSeconds: 0
            },
            activity: createDefaultActivity(now),
            overviewOrder: [],
            analyticsPeriod: "week"
        };
    }

    function createTask(title, subject, priority, status, dueDate, description) {
        const nowIso = new Date().toISOString();
        return {
            id: uid("task"),
            title,
            description: description || "",
            subject,
            priority,
            status,
            dueDate,
            createdAt: nowIso,
            completedAt: status === "done" ? nowIso : null
        };
    }

    function createAcademicTasks(subjects, now) {
        const tasks = [];
        let dayOffset = 1;
        subjects.forEach((subject) => {
            subject.papers.forEach((paper, paperIndex) => {
                paper.topicIds.forEach((topicId, topicIndex) => {
                    const topic = subject.topics.find((item) => item.id === topicId);
                    if (!topic) {
                        return;
                    }
                    const priority = paper.level === "AS" ? (topicIndex < 2 ? "High" : "Medium") : (topicIndex < 1 ? "High" : "Medium");
                    const status = tasks.length < 5 ? "in-progress" : "todo";
                    const description = `${paper.name} - ${topic.subtopics.join(", ")}`;
                    tasks.push(createTask(`${subject.name}: ${paper.name} - ${topic.name}`, subject.name, priority, status, addDaysISO(now, dayOffset), description));
                    dayOffset = (dayOffset % 21) + 1;
                });
            });
        });

        tasks.push(createTask("SAT maths competitive set", "Maths", "Medium", "todo", addDaysISO(now, 8), "Integration by parts, substitution, differential equations, 3D vectors, complex numbers, and numerical methods."));
        tasks.push(createTask("AMC 12 problem sprint", "Maths", "Medium", "todo", addDaysISO(now, 12), "Timed competitive maths round with proof and algebra emphasis."));
        tasks.push(createTask("International Economics Olympiad prep", "Economics", "Medium", "todo", addDaysISO(now, 10), "Micro theory, macro policy, and data analysis under timed conditions."));
        tasks.push(createTask("Economics Olympiad MCQ review", "Economics", "Medium", "todo", addDaysISO(now, 13), "Market structures, intervention, and comparative advantage quick-fire questions."));
        tasks.push(createTask("IELTS reading and writing drill", "English", "Low", "todo", addDaysISO(now, 14), "Academic reading precision, summary writing, and essay clarity."));
        tasks.push(createTask("IMO style proof practice", "Further Maths", "Low", "todo", addDaysISO(now, 16), "Induction, functional reasoning, and non-routine algebra."));
        return tasks;
    }

    function createSupplementalTasks(now) {
        return [
            createTask("GRYDX Bloomberg API integration milestone", "Projects", "High", "in-progress", addDaysISO(now, 2), "Wire Bloomberg data, version control, and model effectiveness scoring."),
            createTask("VOXA booking agent and reminder flow", "Projects", "High", "in-progress", addDaysISO(now, 3), "Confirm slots, reminders, and CRM updates for inbound bookings."),
            createTask("PITAR hand-signal decoding demo", "Projects", "High", "todo", addDaysISO(now, 4), "Capture trading floor gestures through webcam and extract intent plus price."),
            createTask("Multi-stock ML model conversion", "Projects", "High", "todo", addDaysISO(now, 7), "Move the single-stock system to multi-stock while preserving the volatility score."),
            createTask("Efficient attention experiment run", "Projects", "High", "in-progress", addDaysISO(now, 5), "Benchmark Transformer, Reformer, and Performer on long financial sequences."),
            createTask("Internship application tracker refresh", "Projects", "Medium", "todo", addDaysISO(now, 9), "Update boutique IB, quant trading, PWM, and economics organization pipeline."),
            createTask("5:00 AM wakeup and cardio lock-in", "Personal", "Medium", "done", addDaysISO(now, 0), "Wake up on time, finish cardio, and set the tone for Study Block 1."),
            createTask("Weekly review and schedule rebalance", "Personal", "Low", "todo", addDaysISO(now, 11), "Review underperforming domains and reset next week's allocation.")
        ];
    }

    function createDefaultHabits(now) {
        const base = [
            { name: "Wake Up 5:00 AM", category: "wellness", timeOfDay: "05:00" },
            { name: "Morning Cardio", category: "exercise", timeOfDay: "05:30" },
            { name: "Gym Session", category: "exercise", timeOfDay: "06:30" },
            { name: "Bath and Breakfast", category: "wellness", timeOfDay: "08:30" },
            { name: "Study Block 1", category: "learning", timeOfDay: "09:30" },
            { name: "Lunch at 2:00 PM", category: "wellness", timeOfDay: "14:00" },
            { name: "Study Block 2", category: "learning", timeOfDay: "16:00" },
            { name: "Sports or Break", category: "exercise", timeOfDay: "18:00" },
            { name: "Dinner at 9:00 PM", category: "wellness", timeOfDay: "21:00" },
            { name: "Night Study Reset", category: "productivity", timeOfDay: "21:30" }
        ];
        return base.map((habit, index) => {
            const completions = {};
            for (let i = 0; i < 14; i += 1) {
                const date = addDaysISO(now, -i);
                const completed = index % 3 === 0 ? i % 2 === 0 : i % 4 !== 0;
                if (completed) {
                    completions[date] = true;
                }
            }
            return {
                id: uid("habit"),
                name: habit.name,
                category: habit.category,
                frequency: "daily",
                timeOfDay: habit.timeOfDay,
                completions,
                createdAt: now.toISOString()
            };
        });
    }

    function createDefaultTimeBlocks(now) {
        const today = localDateISO(now);
        const blocks = [
            { start: "05:00", end: "05:30", label: "Wake Up", domain: "Personal" },
            { start: "05:30", end: "06:30", label: "Morning Cardio", domain: "Health" },
            { start: "06:30", end: "08:30", label: "Gym Session", domain: "Health" },
            { start: "08:30", end: "09:00", label: "Bath and Breakfast", domain: "Personal" },
            { start: "09:30", end: "14:00", label: "Study Block 1 (4-5 Hours)", domain: "Academics" },
            { start: "14:00", end: "14:30", label: "Lunch", domain: "Personal" },
            { start: "16:00", end: "18:00", label: "Study Block 2 (2-3 Hours)", domain: "Academics" },
            { start: "18:00", end: "19:00", label: "Sports", domain: "Health" },
            { start: "21:00", end: "21:30", label: "Dinner", domain: "Personal" },
            { start: "21:30", end: "23:00", label: "Night Study Block", domain: "Academics" },
            { start: "23:00", end: "23:59", label: "Sleep Start", domain: "Sleep" }
        ];
        return blocks.map((block, idx) => ({
            id: uid("tb"),
            title: block.label,
            start: block.start,
            end: block.end,
            domain: block.domain,
            targetMinutes: minutesBetween(block.start, block.end),
            completions: idx < 3 ? { [today]: true } : {}
        }));
    }

    function createDefaultActivityLogs(now) {
        const logs = [];
        for (let day = 0; day < 10; day += 1) {
            const date = addDaysISO(now, -day);
            const academicContext = ["Mathematics", "Further Maths", "Physics", "Economics", "Accounts", "English"][day % 6];
            const projectContext = ["GRYDX", "VOXA", "PITAR", "ML Model", "GLOBALDESK", "Research Paper"][day % 6];
            const cardioContext = ["2K Jog", "4K Walk", "3K Jog", "4K Walk", "2K Jog", "Basketball"][day % 6];
            logs.push(createActivityLog("Study", "Academics", day % 2 === 0 ? 255 : 210, date, academicContext));
            logs.push(createActivityLog("Project Work", "Projects", day % 3 === 0 ? 150 : 105, date, projectContext));
            logs.push(createActivityLog("Gym", "Health", day % 2 === 0 ? 90 : 75, date, "Gym Routine"));
            logs.push(createActivityLog("Sport", "Health", day % 2 === 0 ? 45 : 30, date, cardioContext));
            logs.push(createActivityLog("Sleep", "Sleep", day % 4 === 0 ? 390 : 450, date, "Night Sleep"));
            logs.push(createActivityLog("Meal", "Personal", 105, date, "Breakfast Lunch Dinner"));
        }
        return logs;
    }

    function createDefaultProjects(now) {
        return [
            {
                id: uid("proj"),
                name: "GRYDX",
                description: "High-finance spreadsheet with AI chatbot.",
                icon: "📊",
                status: "in-progress",
                progress: 60,
                techStack: ["Next.js", "TypeScript", "Supabase", "OpenAI"],
                url: "https://github.com",
                milestones: [
                    createMilestone("Portfolio risk heatmap", addDaysISO(now, 5), true),
                    createMilestone("Cashflow formula audit", addDaysISO(now, 9), false),
                    createMilestone("Chat assistant beta", addDaysISO(now, 14), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "PITAR",
                description: "AR engine for open-outcry trading simulation.",
                icon: "🥽",
                status: "in-progress",
                progress: 45,
                techStack: ["Unity", "WebXR", "Node"],
                url: "",
                milestones: [
                    createMilestone("Latency benchmark suite", addDaysISO(now, 8), false),
                    createMilestone("Gesture input v2", addDaysISO(now, 13), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "VOXA",
                description: "AI personal assistant and business receptionist.",
                icon: "🎙️",
                status: "active",
                progress: 80,
                techStack: ["FastAPI", "Whisper", "Twilio"],
                url: "",
                milestones: [
                    createMilestone("Client onboarding flow", addDaysISO(now, 3), true),
                    createMilestone("Intent routing QA", addDaysISO(now, 7), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "ML Trading Model",
                description: "Multi-stock reinforcement learning trading system.",
                icon: "🤖",
                status: "planning",
                progress: 30,
                techStack: ["PyTorch", "Gymnasium", "Pandas"],
                url: "",
                milestones: [
                    createMilestone("Feature store setup", addDaysISO(now, 10), false),
                    createMilestone("Reward shaping experiment", addDaysISO(now, 16), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "Research Paper",
                description: "Efficient attention for financial forecasting.",
                icon: "🧪",
                status: "in-progress",
                progress: 55,
                techStack: ["LaTeX", "Python", "JAX"],
                url: "",
                milestones: [
                    createMilestone("Literature review complete", addDaysISO(now, 6), true),
                    createMilestone("Ablation section draft", addDaysISO(now, 12), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "Finance Internships",
                description: "Boutique IB, quant, and PWM applications.",
                icon: "💼",
                status: "active",
                progress: 65,
                techStack: ["Notion", "Sheets", "Canva"],
                url: "",
                milestones: [
                    createMilestone("CV final pass", addDaysISO(now, 2), true),
                    createMilestone("Networking tracker", addDaysISO(now, 4), false),
                    createMilestone("Mock interview pack", addDaysISO(now, 11), false)
                ],
                createdAt: now.toISOString()
            }
        ];
    }

    function createMilestone(title, dueDate, completed) {
        return { id: uid("mile"), title, dueDate, completed: Boolean(completed) };
    }

    function createDefaultSubjects(now) {
        return [
            createSubject("Physics", "⚛️", ["P1 MCQ", "P2 Structured", "P3 Practical", "P4 A2 Structured", "P5 Planning"], [
                "Kinematics", "Dynamics", "Forces and Motion", "Work, Energy, Power", "Momentum",
                "Material Properties", "Waves", "Superposition", "Electric Fields", "Current of Electricity",
                "D.C. Circuits", "Particle and Nuclear Physics", "Gravitational Fields", "Circular Motion",
                "Thermodynamics", "Oscillations", "Magnetic Fields", "Electromagnetic Induction",
                "Quantum Physics", "Cosmology", "Practical Planning", "Data Analysis"
            ], now),
            createSubject("Maths", "∑", ["P1 Pure", "P4 Mechanics", "FP1", "Further Maths"], [
                "Quadratics", "Functions", "Coordinate Geometry", "Sequences and Series", "Binomial Expansion",
                "Trigonometry", "Differentiation", "Integration", "Vectors", "Complex Numbers",
                "Matrices", "Differential Equations", "Proof", "Maclaurin Series", "Mechanics Kinematics",
                "Forces and Friction", "Momentum and Impulse", "Moments", "Probability", "Statistics Review",
                "Hyperbolic Functions", "Polar Coordinates"
            ], now),
            createSubject("Economics", "📈", ["MCQ", "Data Response", "Essay"], [
                "Basic Economic Problem", "Demand and Supply", "Elasticity", "Market Failure", "Government Intervention",
                "Production and Costs", "Perfect Competition", "Monopoly", "National Income", "Inflation",
                "Unemployment", "Fiscal Policy", "Monetary Policy", "Exchange Rates", "Balance of Payments",
                "Trade Protection", "Development Economics", "Poverty and Inequality", "AD/AS", "Globalisation",
                "Evaluation Chains", "Essay Structures"
            ], now),
            createSubject("Accounts", "🧾", ["P1 MCQ", "P2 Structured"], [
                "Double Entry", "Ledger Accounts", "Trial Balance", "Bank Reconciliation", "Control Accounts",
                "Depreciation", "Irrecoverable Debts", "Accruals and Prepayments", "Income Statement",
                "Statement of Financial Position", "Cash Flow Statements", "Partnership Accounts",
                "Incomplete Records", "Manufacturing Accounts", "Published Accounts", "Ratios Analysis",
                "Budgeting", "Variance Analysis", "Inventory Valuation", "Ethics in Accounting"
            ], now)
        ];
    }

    function createSubject(name, icon, papers, topicNames, now) {
        const topics = topicNames.map((topicName, idx) => ({
            id: uid("topic"),
            name: topicName,
            status: idx % 7 === 0 ? "confident" : idx % 5 === 0 ? "familiar" : "not-started"
        }));
        return {
            id: uid("sub"),
            name,
            icon,
            papers,
            topics,
            exams: [
                { date: addDaysISO(now, 21), paper: papers[0], subject: name, duration: 90 },
                { date: addDaysISO(now, 35), paper: papers[Math.min(1, papers.length - 1)], subject: name, duration: 120 }
            ],
            mockScores: [68, 74, 79]
        };
    }

    function createDefaultSubjects(now) {
        return [
            createSubject("Maths", "M", [
                {
                    name: "Paper 1: Pure Mathematics 1",
                    level: "AS",
                    duration: "1hr 45min",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Quadratics and Functions", subtopics: ["quadratic equations", "completing the square", "discriminant", "domain and range"] },
                        { name: "Coordinate Geometry", subtopics: ["straight lines", "circles", "distance formula", "midpoint formula"] },
                        { name: "Circular Measure", subtopics: ["radians", "arc length", "sector area"] },
                        { name: "Binomial Expansion", subtopics: ["binomial theorem", "Pascal triangle", "approximations"] },
                        { name: "Trigonometric Identities", subtopics: ["sin^2x + cos^2x = 1", "double angle", "solving trig equations"] },
                        { name: "Differentiation: Polynomials", subtopics: ["first principles", "chain rule basics", "tangents", "normals"] },
                        { name: "Integration: Polynomials", subtopics: ["indefinite integrals", "definite integrals", "area under a curve"] },
                        { name: "Sequences and Series", subtopics: ["AP", "GP", "sum to n", "sum to infinity"] },
                        { name: "2D Vectors", subtopics: ["notation", "addition", "magnitude", "unit vectors", "position vectors"] }
                    ]
                },
                {
                    name: "Paper 4: Mechanics (AS)",
                    level: "AS",
                    duration: "1hr 15min",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Forces and Equilibrium", subtopics: ["resolving forces", "Lami theorem", "triangles of forces"] },
                        { name: "Newton Laws", subtopics: ["F=ma", "connected particles", "pulleys"] },
                        { name: "Kinematics (SUVAT)", subtopics: ["constant acceleration", "SUVAT equations", "velocity-time graphs"] },
                        { name: "Projectile Motion", subtopics: ["horizontal and vertical components", "range", "time of flight"] },
                        { name: "Work, Energy and Power", subtopics: ["work-energy theorem", "conservation of energy", "power"] },
                        { name: "Momentum and Impulse", subtopics: ["conservation of momentum", "impulse-momentum theorem"] },
                        { name: "Friction and Inclined Planes", subtopics: ["coefficient of friction", "limiting friction", "slopes"] },
                        { name: "Connected Particles", subtopics: ["strings over pulleys", "Atwood machine"] }
                    ]
                },
                {
                    name: "Probability and Statistics 1 (AS)",
                    level: "AS",
                    duration: "1hr 15min",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Representation of Data", subtopics: ["stem-and-leaf", "histograms", "box plots", "cumulative frequency"] },
                        { name: "Permutations and Combinations", subtopics: ["nPr", "nCr", "restrictions"] },
                        { name: "Probability", subtopics: ["Venn diagrams", "conditional probability", "mutually exclusive events"] },
                        { name: "Discrete Random Variables", subtopics: ["expectation", "variance", "distribution tables"] },
                        { name: "The Normal Distribution", subtopics: ["standardisation", "Z-scores", "probabilities"] }
                    ]
                },
                {
                    name: "Paper 2: Pure Mathematics 2",
                    level: "A2",
                    duration: "1hr 15min",
                    session: "Feb/Mar 2027",
                    topics: [
                        { name: "Polynomials and Remainder Theorem", subtopics: ["factor theorem", "long division", "remainder theorem"] },
                        { name: "Logarithmic and Exponential Functions", subtopics: ["log laws", "solving exponential equations", "natural log"] },
                        { name: "Trigonometry: sec cosec cot", subtopics: ["reciprocal trig", "identities", "equations"] },
                        { name: "Product Quotient and Chain Rules", subtopics: ["composite functions", "products", "quotients"] },
                        { name: "Differential Equations", subtopics: ["forming DEs", "first-order separable equations"] },
                        { name: "Parametric Equations", subtopics: ["parametric differentiation", "Cartesian conversion"] },
                        { name: "Vectors: 3D Lines and Planes", subtopics: ["vector equations", "angles", "intersections"] },
                        { name: "Modulus Functions and Inequalities", subtopics: ["graphs", "equations", "inequalities"] }
                    ]
                },
                {
                    name: "Paper 3: Pure Mathematics 3",
                    level: "A2",
                    duration: "1hr 15min",
                    session: "Oct/Nov 2027",
                    topics: [
                        { name: "Algebra", subtopics: ["partial fractions", "rational expressions"] },
                        { name: "Advanced Logarithmic and Exponential Functions", subtopics: ["natural log", "growth", "decay"] },
                        { name: "Advanced Trigonometry", subtopics: ["compound angle", "R sin/cos form"] },
                        { name: "Differentiation II", subtopics: ["implicit differentiation", "parametric differentiation"] },
                        { name: "Integration II", subtopics: ["parts", "substitution", "partial fractions", "volumes"] },
                        { name: "Numerical Solutions of Equations", subtopics: ["Newton-Raphson", "iteration", "bisection"] },
                        { name: "Vectors II", subtopics: ["scalar product", "lines and planes"] },
                        { name: "Differential Equations II", subtopics: ["separable equations", "linear equations"] },
                        { name: "Complex Numbers", subtopics: ["Cartesian form", "modulus-argument form", "Argand diagram"] }
                    ]
                }
            ], now, [
                { date: addDaysISO(now, 150), paper: "Paper 1: Pure Mathematics 1", subject: "Maths", duration: 105 },
                { date: addDaysISO(now, 280), paper: "Paper 2: Pure Mathematics 2", subject: "Maths", duration: 75 }
            ], [76, 81, 84]),
            createSubject("Further Maths", "FM", [
                {
                    name: "Further Pure 1",
                    level: "A2",
                    duration: "1hr 30min",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Matrices: Determinant and Inverse", subtopics: ["determinant", "inverse", "singular matrices"] },
                        { name: "Transformations Using Matrices", subtopics: ["rotation", "reflection", "enlargement", "shear"] },
                        { name: "Series Summation", subtopics: ["standard results", "method of differences"] },
                        { name: "Proof by Induction", subtopics: ["series", "divisibility", "recurrence"] },
                        { name: "Complex Numbers and Argand Diagram", subtopics: ["modulus-argument", "loci", "Argand transformations"] },
                        { name: "Roots of Polynomial Equations", subtopics: ["relationships between roots", "transforming equations"] },
                        { name: "Numerical Methods (Newton-Raphson)", subtopics: ["iterative methods", "convergence", "error bounds"] },
                        { name: "Polar Coordinates", subtopics: ["curve sketching", "area", "tangents"] }
                    ]
                },
                {
                    name: "Further Pure 2",
                    level: "A2",
                    duration: "1hr 30min",
                    session: "Feb/Mar 2027",
                    topics: [
                        { name: "Hyperbolic Functions", subtopics: ["sinh", "cosh", "tanh", "inverse hyperbolics"] },
                        { name: "Further Complex Numbers: de Moivre", subtopics: ["nth roots", "applications", "loci"] },
                        { name: "Groups", subtopics: ["axioms", "cyclic groups", "order"] },
                        { name: "Second Order Differential Equations", subtopics: ["complementary function", "particular integral", "boundary conditions"] },
                        { name: "Polar Coordinates and Areas", subtopics: ["areas enclosed by polar curves"] },
                        { name: "Maclaurin Series", subtopics: ["standard expansions", "multiplication", "substitution"] },
                        { name: "Arc Length and Surface of Revolution", subtopics: ["arc length", "surface area"] },
                        { name: "Reduction Formulae", subtopics: ["derive recurrence", "use reduction formulae"] }
                    ]
                },
                {
                    name: "Further Mechanics",
                    level: "A2",
                    duration: "1hr 15min",
                    session: "Oct/Nov 2026 + Feb/Mar 2027",
                    topics: [
                        { name: "Circular Motion", subtopics: ["centripetal acceleration", "conical pendulum", "banking"] },
                        { name: "Centre of Mass", subtopics: ["laminas", "composite bodies", "solids of revolution"] },
                        { name: "Elastic Strings and Springs", subtopics: ["Hooke law", "elastic potential energy", "oscillations"] },
                        { name: "Simple Harmonic Motion", subtopics: ["SHM equation", "amplitude", "period", "energy"] },
                        { name: "Damped and Forced Oscillations", subtopics: ["critical damping", "overdamped", "resonance"] },
                        { name: "Collisions and Coefficient of Restitution", subtopics: ["restitution", "oblique collisions"] },
                        { name: "Moment of Inertia", subtopics: ["parallel axis", "perpendicular axis", "standard bodies"] },
                        { name: "Rotation of Rigid Bodies", subtopics: ["torque", "angular acceleration", "angular momentum"] },
                        { name: "Angular Momentum", subtopics: ["conservation", "impulsive torques"] }
                    ]
                },
                {
                    name: "Further Probability and Statistics 1",
                    level: "A2",
                    duration: "1hr 15min",
                    session: "A2",
                    topics: [
                        { name: "Continuous Random Variables", subtopics: ["PDF", "CDF", "expectation", "variance", "median"] },
                        { name: "Inference Using Normal and t-Distributions", subtopics: ["confidence intervals", "hypothesis tests", "t-distribution"] },
                        { name: "Chi-squared Tests", subtopics: ["goodness of fit", "contingency tables", "degrees of freedom"] },
                        { name: "Non-Parametric Tests", subtopics: ["sign test", "Wilcoxon", "Mann-Whitney"] },
                        { name: "Probability Generating Functions", subtopics: ["definition", "mean", "variance", "sums of variables"] }
                    ]
                }
            ], now, [
                { date: addDaysISO(now, 165), paper: "Further Pure 1", subject: "Further Maths", duration: 90 },
                { date: addDaysISO(now, 290), paper: "Further Pure 2", subject: "Further Maths", duration: 90 }
            ], [72, 78, 82]),
            createSubject("Economics", "E", [
                {
                    name: "Paper 1: MCQ Microeconomics",
                    level: "AS",
                    duration: "1hr",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Supply and Demand", subtopics: ["curve shifts", "equilibrium", "price mechanism"] },
                        { name: "Price Elasticity", subtopics: ["PED", "PES", "YED", "XED"] },
                        { name: "Market Structures", subtopics: ["perfect competition", "monopoly", "oligopoly", "monopolistic competition"] },
                        { name: "Market Failure and Externalities", subtopics: ["externalities", "public goods", "merit and demerit goods"] },
                        { name: "Government Intervention", subtopics: ["taxes", "subsidies", "price controls", "regulation"] },
                        { name: "Comparative Advantage", subtopics: ["absolute vs comparative advantage", "specialisation", "free trade"] }
                    ]
                },
                {
                    name: "Paper 2: Data Response and Essay Microeconomics",
                    level: "AS",
                    duration: "2hrs",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Interpreting Microeconomic Data", subtopics: ["diagrams", "tables", "graphs", "data analysis"] },
                        { name: "Market Failure and Welfare Loss", subtopics: ["consumer surplus", "producer surplus", "deadweight loss"] },
                        { name: "Cost-Benefit Analysis", subtopics: ["social costs", "social benefits", "NPV"] },
                        { name: "Monopoly vs Competition Essays", subtopics: ["efficiency", "consumer welfare", "contestability"] },
                        { name: "Trade Policy: Tariffs vs Quotas", subtopics: ["welfare effects", "WTO rules", "trade diagrams"] },
                        { name: "Factor Markets and Wages", subtopics: ["labour demand", "labour supply", "minimum wage", "wage differentials"] }
                    ]
                },
                {
                    name: "Paper 3: MCQ Macroeconomics",
                    level: "A2",
                    duration: "1hr",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "AD/AS Model", subtopics: ["AD shifts", "AS shifts", "equilibrium output and price level"] },
                        { name: "Multiplier and Accelerator", subtopics: ["multiplier effect", "accelerator principle"] },
                        { name: "Inflation: Causes and Policies", subtopics: ["demand-pull", "cost-push", "CPI", "policy response"] },
                        { name: "Unemployment and Natural Rate", subtopics: ["types of unemployment", "NAIRU", "policy response"] },
                        { name: "Monetary and Fiscal Policy", subtopics: ["interest rates", "money supply", "spending", "taxation"] },
                        { name: "Balance of Payments", subtopics: ["current account", "capital account", "deficits", "surpluses"] },
                        { name: "Development Economics", subtopics: ["HDI", "poverty", "inequality", "structural factors"] }
                    ]
                },
                {
                    name: "Paper 4: Data Response and Essay Macroeconomics",
                    level: "A2",
                    duration: "2hrs 15min",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Macroeconomic Policy Conflicts", subtopics: ["inflation vs unemployment", "policy dilemmas"] },
                        { name: "Exchange Rate Systems", subtopics: ["fixed", "floating", "managed", "trade and inflation effects"] },
                        { name: "Current Account Analysis", subtopics: ["J-curve", "Marshall-Lerner", "deficits and surpluses"] },
                        { name: "Globalisation and Inequality", subtopics: ["benefits", "costs", "FDI", "distribution"] },
                        { name: "IMF World Bank and WTO", subtopics: ["roles", "criticisms", "conditionality"] },
                        { name: "Economic Growth Models", subtopics: ["Harrod-Domar", "Solow", "endogenous growth"] },
                        { name: "Fiscal vs Monetary Policy", subtopics: ["effectiveness", "crowding out", "liquidity trap"] }
                    ]
                }
            ], now, [
                { date: addDaysISO(now, 155), paper: "Paper 1: MCQ Microeconomics", subject: "Economics", duration: 60 },
                { date: addDaysISO(now, 158), paper: "Paper 3: MCQ Macroeconomics", subject: "Economics", duration: 60 }
            ], [70, 75, 80]),
            createSubject("Accounts", "A", [
                {
                    name: "Paper 1: MCQ (AS)",
                    level: "AS",
                    duration: "1hr",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Double-Entry Bookkeeping", subtopics: ["debits and credits", "T-accounts", "trial balance"] },
                        { name: "Bank Reconciliation", subtopics: ["outstanding items", "adjusted cash book", "reconciliation statement"] },
                        { name: "Control Accounts", subtopics: ["sales ledger", "purchases ledger", "reconciling balances"] },
                        { name: "Correction of Errors", subtopics: ["types of errors", "suspense account", "journal entries"] },
                        { name: "Depreciation Methods", subtopics: ["straight-line", "reducing balance", "disposal"] },
                        { name: "Inventory Valuation", subtopics: ["FIFO", "AVCO", "profit impact"] },
                        { name: "Financial Statements (Sole Trader)", subtopics: ["income statement", "balance sheet", "notes"] },
                        { name: "Basic Cost Classification", subtopics: ["fixed", "variable", "semi-variable", "direct and indirect"] }
                    ]
                },
                {
                    name: "Paper 2: Structured Questions (AS)",
                    level: "AS",
                    duration: "1hr 30min",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Incomplete Records", subtopics: ["net assets approach", "account reconstruction"] },
                        { name: "Partnership Accounts", subtopics: ["appropriation", "capital accounts", "goodwill"] },
                        { name: "Company Financial Statements", subtopics: ["published accounts", "dividends", "share capital"] },
                        { name: "Ratio Analysis", subtopics: ["liquidity", "profitability", "efficiency", "gearing"] },
                        { name: "Cash Flow Statements", subtopics: ["operating", "investing", "financing", "indirect method"] },
                        { name: "Manufacturing Accounts", subtopics: ["cost of production", "prime cost", "overhead"] },
                        { name: "Budgeted vs Actual Cost", subtopics: ["variance calculation", "budget preparation"] }
                    ]
                },
                {
                    name: "Paper 3: MCQ (A2)",
                    level: "A2",
                    duration: "1hr",
                    session: "Feb/Mar 2027",
                    topics: [
                        { name: "Company Statements (IAS/IFRS)", subtopics: ["standards", "presentation", "recognition criteria"] },
                        { name: "Merger and Acquisition Accounting", subtopics: ["goodwill", "fair value adjustments"] },
                        { name: "Regulatory and Ethical Framework", subtopics: ["accounting bodies", "ethics"] },
                        { name: "Consolidated Statements", subtopics: ["group accounts", "minority interest", "elimination"] },
                        { name: "Investment Appraisal (NPV)", subtopics: ["NPV", "IRR", "discounting"] },
                        { name: "Activity-Based Costing (ABC)", subtopics: ["cost drivers", "cost pools", "vs traditional costing"] },
                        { name: "Standard Costing and Variances", subtopics: ["price", "usage", "labour rate", "labour efficiency"] },
                        { name: "Marginal vs Absorption Costing", subtopics: ["contribution", "profit reconciliation"] },
                        { name: "Computerised Accounting Systems", subtopics: ["software", "controls", "advantages"] }
                    ]
                },
                {
                    name: "Paper 4: Structured Questions (A2)",
                    level: "A2",
                    duration: "1hr",
                    session: "Feb/Mar 2027",
                    topics: [
                        { name: "Activity-Based Costing: Cost Drivers", subtopics: ["identify cost drivers", "allocate overheads"] },
                        { name: "Standard Costing Variances", subtopics: ["calculate and interpret variances"] },
                        { name: "Budgetary Control and Flexible Budgets", subtopics: ["fixed vs flexible budgets", "flexed profit statements"] },
                        { name: "Capital Investment Appraisal", subtopics: ["NPV", "IRR", "payback", "ARR"] },
                        { name: "Decision-Making: Make or Buy", subtopics: ["relevant costs", "opportunity cost", "qualitative factors"] },
                        { name: "Marginal Costing: Break-Even", subtopics: ["break-even", "margin of safety", "contribution graphs"] },
                        { name: "Absorption Costing: Overhead Rates", subtopics: ["blanket rate", "departmental rate", "over or under absorption"] },
                        { name: "Pricing Strategies", subtopics: ["cost-plus", "marginal cost pricing", "price discrimination"] },
                        { name: "Balanced Scorecard", subtopics: ["four perspectives", "KPIs", "strategic alignment"] }
                    ]
                }
            ], now, [
                { date: addDaysISO(now, 160), paper: "Paper 1: MCQ (AS)", subject: "Accounts", duration: 60 },
                { date: addDaysISO(now, 285), paper: "Paper 3: MCQ (A2)", subject: "Accounts", duration: 60 }
            ], [74, 79, 83]),
            createSubject("English", "EN", [
                {
                    name: "Component 1: Comprehension",
                    level: "AS",
                    duration: "Exam format varies",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Directed Writing", subtopics: ["letter", "speech", "report", "repurpose information"] },
                        { name: "Summary Writing", subtopics: ["identify key points", "condense clearly", "avoid lifting"] },
                        { name: "Vocabulary in Context", subtopics: ["meaning in passage context", "precision"] },
                        { name: "Inference and Implicit Meaning", subtopics: ["tone", "attitude", "reading between the lines"] },
                        { name: "Writer Language and Style", subtopics: ["metaphor", "tone", "structure", "effect"] },
                        { name: "Evaluating Evidence", subtopics: ["argument strength", "validity", "persuasiveness"] }
                    ]
                },
                {
                    name: "Component 2: Essay",
                    level: "AS",
                    duration: "Exam format varies",
                    session: "Oct/Nov 2026",
                    topics: [
                        { name: "Argumentative Writing", subtopics: ["clear thesis", "logical structure", "evidence"] },
                        { name: "Discursive Writing", subtopics: ["multiple perspectives", "balance", "measured judgement"] },
                        { name: "Science and Technology", subtopics: ["AI", "data privacy", "medical ethics", "space exploration"] },
                        { name: "Environment and Sustainability", subtopics: ["climate change", "renewables", "green economy"] },
                        { name: "Politics and Global Affairs", subtopics: ["democracy", "international relations", "human rights"] },
                        { name: "Ethics and Moral Philosophy", subtopics: ["capital punishment", "euthanasia", "censorship", "justice"] }
                    ]
                },
                {
                    name: "A2 Thematic Topics",
                    level: "A2",
                    duration: "Theme bank",
                    session: "A2",
                    topics: [
                        { name: "Political Social Economic and Ethical Issues", subtopics: ["governance", "inequality", "corruption", "corporate ethics"] },
                        { name: "Science Technology and Environment", subtopics: ["genetic engineering", "nuclear energy", "climate policy"] },
                        { name: "The Macroeconomy", subtopics: ["globalisation", "economic development", "poverty"] },
                        { name: "Culture Media and Arts", subtopics: ["cultural imperialism", "social media impact", "artistic censorship"] }
                    ]
                }
            ], now, [
                { date: addDaysISO(now, 170), paper: "Component 1: Comprehension", subject: "English", duration: 90 }
            ], [73, 77, 81])
        ];
    }

    function createSubject(name, icon, papers, now, exams, mockScores) {
        const topics = [];
        const structuredPapers = papers.map((paper) => {
            const topicIds = paper.topics.map((topic, idx) => {
                const created = {
                    id: uid("topic"),
                    name: topic.name,
                    subtopics: topic.subtopics,
                    paperName: paper.name,
                    level: paper.level,
                    duration: paper.duration,
                    status: idx % 6 === 0 ? "confident" : idx % 4 === 0 ? "familiar" : "not-started"
                };
                topics.push(created);
                return created.id;
            });
            return {
                name: paper.name,
                level: paper.level,
                duration: paper.duration,
                session: paper.session,
                topicIds
            };
        });

        return {
            id: uid("sub"),
            name,
            icon,
            papers: structuredPapers,
            topics,
            exams: exams || [{ date: addDaysISO(now, 120), paper: structuredPapers[0]?.name || "Paper 1", subject: name, duration: 90 }],
            mockScores: mockScores || [70, 75, 80]
        };
    }

    function createDefaultProjects(now) {
        return [
            {
                id: uid("proj"),
                name: "GRYDX",
                description: "Spreadsheet platform for high finance with Bloomberg integration, version control, AI error scanning, auto-fixes, and formula generation.",
                icon: "GR",
                status: "in-progress",
                progress: 60,
                techStack: ["Bloomberg API", "AI", "Spreadsheet Engine"],
                url: "https://github.com",
                milestones: [
                    createMilestone("Bloomberg API integration", addDaysISO(now, 5), true),
                    createMilestone("AI error scanner", addDaysISO(now, 10), false),
                    createMilestone("Model effectiveness score", addDaysISO(now, 16), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "VOXA",
                description: "AI personal assistant and business AI receptionist spanning calls, messages, CRM, lead qualification, and reminders.",
                icon: "VX",
                status: "active",
                progress: 80,
                techStack: ["Calls", "WhatsApp", "CRM", "Notifications"],
                url: "",
                milestones: [
                    createMilestone("Booking agent", addDaysISO(now, 3), true),
                    createMilestone("Lead qualification", addDaysISO(now, 7), false),
                    createMilestone("Notification hub", addDaysISO(now, 12), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "PITAR",
                description: "Augmented reality engine that deciphers trading floor hand signals into trades with voice or gesture confirmation.",
                icon: "PT",
                status: "in-progress",
                progress: 45,
                techStack: ["Webcam", "Signal Decoder", "Trade Execution"],
                url: "",
                milestones: [
                    createMilestone("AR capture layer", addDaysISO(now, 6), false),
                    createMilestone("Price negotiation parser", addDaysISO(now, 11), false),
                    createMilestone("Approval workflow", addDaysISO(now, 15), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "Multi-Stock ML Model",
                description: "Upgrade the single-stock system into a multi-stock model with higher risk tolerance and preserved volatility scoring.",
                icon: "ML",
                status: "planning",
                progress: 35,
                techStack: ["Pandas", "Random Forest", "Yahoo Finance API"],
                url: "",
                milestones: [
                    createMilestone("Multi-stock dataset pipeline", addDaysISO(now, 8), false),
                    createMilestone("Risk calibration", addDaysISO(now, 14), false),
                    createMilestone("Volatility score preservation", addDaysISO(now, 19), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "GLOBALDESK",
                description: "3D macro-intelligence globe pulling IMF and World Bank data for GDP, inflation, FDI, and bilateral capital flows.",
                icon: "GD",
                status: "planning",
                progress: 25,
                techStack: ["3D Globe", "World Bank API", "IMF API"],
                url: "",
                milestones: [
                    createMilestone("Country deep-dive module", addDaysISO(now, 12), false),
                    createMilestone("Bilateral flow monitors", addDaysISO(now, 18), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "Efficient Attention Paper",
                description: "Long-horizon financial forecasting comparison of Transformer, Reformer, and Performer on accuracy, memory, and compute.",
                icon: "RP",
                status: "in-progress",
                progress: 55,
                techStack: ["PyTorch", "LaTeX", "Long-Context Benchmarks"],
                url: "",
                milestones: [
                    createMilestone("Dataset and preprocessing", addDaysISO(now, 4), true),
                    createMilestone("Reformer ablations", addDaysISO(now, 9), false),
                    createMilestone("Appendices and references", addDaysISO(now, 17), false)
                ],
                createdAt: now.toISOString()
            },
            {
                id: uid("proj"),
                name: "Internships and Courses",
                description: "Applications and skill-building across boutique IB, quant trading, PWM, international economics, and research pipelines.",
                icon: "IN",
                status: "active",
                progress: 65,
                techStack: ["IB", "Quant", "PWM", "Research"],
                url: "",
                milestones: [
                    createMilestone("Application tracker refresh", addDaysISO(now, 2), true),
                    createMilestone("Networking follow-up loop", addDaysISO(now, 6), false),
                    createMilestone("Mock interviews", addDaysISO(now, 13), false)
                ],
                createdAt: now.toISOString()
            }
        ];
    }

    function createDefaultActivity(now) {
        return [
            createActivity("ph-books", "Maths: Quadratics and Functions moved into active revision", new Date(now.getTime() - 1000 * 60 * 80)),
            createActivity("ph-target", "Completed Study Block 1 with a Further Maths focus sprint", new Date(now.getTime() - 1000 * 60 * 150)),
            createActivity("ph-rocket-launch", "VOXA booking agent milestone pushed forward", new Date(now.getTime() - 1000 * 60 * 260)),
            createActivity("ph-check-circle", "Finished Accounts ratio analysis structured practice", new Date(now.getTime() - 1000 * 60 * 420)),
            createActivity("ph-chart-line-up", "Updated economics macro paper roadmap from the syllabus sync", new Date(now.getTime() - 1000 * 60 * 520))
        ];
    }

    function createActivity(icon, text, when) {
        return {
            id: uid("act"),
            icon,
            text,
            timestamp: when.toISOString()
        };
    }

    function createActivityLog(type, domain, durationMinutes, date, context, notes, energy) {
        return {
            id: uid("alog"),
            type,
            domain,
            durationMinutes: Number(durationMinutes) || 0,
            date: date || localDateISO(new Date()),
            context: context || "",
            notes: notes || "",
            energy: Number(energy) || 3,
            loggedAt: new Date().toISOString()
        };
    }

    function loadState() {
        const fallback = createDefaultState();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return fallback;
            }
            const saved = JSON.parse(raw);
            return {
                tasks: Array.isArray(saved.tasks) ? saved.tasks : fallback.tasks,
                habits: Array.isArray(saved.habits) ? saved.habits : fallback.habits,
                timeBlocks: Array.isArray(saved.timeBlocks) ? saved.timeBlocks : fallback.timeBlocks,
                activityLogs: Array.isArray(saved.activityLogs) ? saved.activityLogs : fallback.activityLogs,
                projects: Array.isArray(saved.projects) ? saved.projects : fallback.projects,
                subjects: Array.isArray(saved.subjects) ? saved.subjects : fallback.subjects,
                focus: {
                    modeMinutes: Number(saved?.focus?.modeMinutes) || fallback.focus.modeMinutes,
                    remainingSeconds: Number(saved?.focus?.remainingSeconds) || fallback.focus.remainingSeconds,
                    status: saved?.focus?.status || fallback.focus.status,
                    endAt: saved?.focus?.endAt || null,
                    sessions: Array.isArray(saved?.focus?.sessions) ? saved.focus.sessions : [],
                    totalCompletedSeconds: Number(saved?.focus?.totalCompletedSeconds) || 0
                },
                activity: Array.isArray(saved.activity) ? saved.activity : fallback.activity,
                overviewOrder: Array.isArray(saved.overviewOrder) ? saved.overviewOrder : [],
                analyticsPeriod: saved.analyticsPeriod || "week"
            };
        } catch (error) {
            console.error("State restore failed:", error);
            return fallback;
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function bindNavigation() {
        const navBtns = Array.from(document.querySelectorAll(".nav-btn"));
        navBtns.forEach((btn) => {
            btn.addEventListener("click", (event) => {
                event.preventDefault();
                const view = btn.dataset.view;
                showView(view);
            });
        });
    }

    function showView(viewName) {
        if (!viewName) {
            return;
        }
        ui.currentView = viewName;
        document.querySelectorAll(".view-section").forEach((section) => {
            section.classList.add("hidden");
            section.classList.remove("active");
        });
        const section = document.getElementById(`${viewName}-view`);
        if (section) {
            section.classList.remove("hidden");
            section.classList.add("active", "animate-fade-in");
        }
        const viewContainer = document.getElementById("view-container");
        if (viewContainer) {
            viewContainer.scrollTo({ top: 0, behavior: "auto" });
        }
        document.querySelectorAll(".nav-btn").forEach((btn) => {
            const active = btn.dataset.view === viewName;
            btn.classList.toggle("active", active);
            btn.classList.toggle("text-white", active);
            btn.classList.toggle("text-dark-muted", !active);
        });
        if (viewName === "analytics") {
            renderAnalytics();
        }
    }

    function bindClock() {
        const clockEl = document.getElementById("live-clock");
        const dateEl = document.getElementById("live-date");
        function updateClock() {
            const now = new Date();
            const clockText = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const dateText = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
            clockEl.textContent = clockText;
            dateEl.textContent = dateText;
            renderDailyRoutineWidget();
        }
        updateClock();
        setInterval(updateClock, 1000);
    }

    function bindTaskUi() {
        const addBtn = document.getElementById("add-task-btn");
        const clearCompletedBtn = document.getElementById("clear-completed-btn");
        const freshStartBtn = document.getElementById("fresh-start-btn");
        const form = document.getElementById("task-form");
        const search = document.getElementById("task-search");
        const subjectFilterBtns = Array.from(document.querySelectorAll(".filter-btn"));
        addBtn.addEventListener("click", () => openTaskModal());
        clearCompletedBtn.addEventListener("click", clearCompletedTasks);
        freshStartBtn.addEventListener("click", resetProgressToFreshStart);
        form.addEventListener("submit", onTaskSubmit);
        search.addEventListener("input", (event) => {
            ui.taskSearch = event.target.value.trim().toLowerCase();
            renderKanban();
        });
        subjectFilterBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                ui.taskFilter = btn.dataset.subject || "All";
                subjectFilterBtns.forEach((item) => {
                    item.classList.remove("active", "bg-dark-panel", "text-white");
                    item.classList.add("bg-transparent", "text-dark-muted");
                });
                btn.classList.add("active", "bg-dark-panel", "text-white");
                btn.classList.remove("bg-transparent", "text-dark-muted");
                renderKanban();
            });
        });
    }

    function bindFocusUi() {
        const modeButtons = Array.from(document.querySelectorAll(".timer-mode-btn"));
        const toggle = document.getElementById("timer-toggle");
        const reset = document.getElementById("timer-reset");

        modeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                if (state.focus.status === "running") {
                    return;
                }
                modeButtons.forEach((item) => item.classList.remove("active", "border-brand-500/50", "bg-brand-500/10", "text-brand-300"));
                btn.classList.add("active", "border-brand-500/50", "bg-brand-500/10", "text-brand-300");
                state.focus.modeMinutes = Number(btn.dataset.time);
                state.focus.remainingSeconds = state.focus.modeMinutes * 60;
                state.focus.status = "ready";
                state.focus.endAt = null;
                renderFocusTimer();
                saveState();
            });
        });

        toggle.addEventListener("click", () => {
            if (state.focus.status === "running") {
                pauseFocus();
            } else {
                startFocus();
            }
        });

        reset.addEventListener("click", () => {
            state.focus.status = "ready";
            state.focus.endAt = null;
            state.focus.remainingSeconds = state.focus.modeMinutes * 60;
            renderFocusTimer();
            saveState();
        });
    }

    function bindModalUi() {
        attachModalDismiss("task-modal", "close-task-modal");
        attachModalDismiss("topic-modal", "close-topic-modal");
        attachModalDismiss("project-modal", "close-project-modal");
        attachModalDismiss("habit-modal", "close-habit-modal");
    }

    function bindTopicUi() {
        document.getElementById("add-topic-btn").addEventListener("click", () => openModal("topic-modal"));
        document.getElementById("topic-form").addEventListener("submit", (event) => {
            event.preventDefault();
            const title = document.getElementById("topic-title").value.trim();
            const subject = document.getElementById("topic-subject").value;
            if (!title) {
                return;
            }
            const subjectObj = state.subjects.find((item) => item.name === subject);
            if (!subjectObj) {
                return;
            }
            subjectObj.topics.push({ id: uid("topic"), name: title, status: "not-started" });
            addActivity("ph-books", `${subject}: Added topic "${title}"`);
            closeModal("topic-modal");
            document.getElementById("topic-form").reset();
            renderAcademics();
            saveState();
        });
    }

    function bindProjectUi() {
        document.getElementById("add-project-btn").addEventListener("click", () => openProjectModal());
        document.getElementById("project-form").addEventListener("submit", onProjectSubmit);
    }

    function bindHabitUi() {
        document.getElementById("add-habit-btn").addEventListener("click", () => openModal("habit-modal"));
        document.getElementById("habit-form").addEventListener("submit", (event) => {
            event.preventDefault();
            const name = document.getElementById("habit-name").value.trim();
            if (!name) {
                return;
            }
            state.habits.push({
                id: uid("habit"),
                name,
                category: "productivity",
                frequency: "daily",
                timeOfDay: "",
                completions: {},
                createdAt: new Date().toISOString()
            });
            addActivity("ph-plant", `Created habit "${name}"`);
            closeModal("habit-modal");
            document.getElementById("habit-form").reset();
            renderHabits();
            renderOverview();
            saveState();
        });
    }

    function bindQuickAddUi() {
        const form = document.getElementById("quick-add-form");
        if (!form) {
            return;
        }
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const type = document.getElementById("quick-activity-type").value;
            const duration = Number(document.getElementById("quick-duration").value);
            const context = document.getElementById("quick-context").value.trim();
            const notes = document.getElementById("quick-notes").value.trim();
            const energy = Number(document.getElementById("quick-energy").value);
            if (!duration || duration < 1) {
                return;
            }
            const domain = activityTypeToDomain(type);
            const date = localDateISO(new Date());
            state.activityLogs.push(createActivityLog(type, domain, duration, date, context, notes, energy));
            maybeMarkCurrentBlockComplete(domain);
            addActivity("ph-lightning", `Quick log: ${type} (${duration}m)${context ? ` - ${context}` : ""}`);
            const feedback = document.getElementById("quick-add-feedback");
            feedback.textContent = `Logged ${type} for ${duration} min (${domain}).`;
            form.reset();
            document.getElementById("quick-duration").value = "45";
            document.getElementById("quick-energy").value = "3";
            renderOverview();
            renderAnalytics();
            saveState();
        });
    }

    function bindAnalyticsUi() {
        const periodButtons = Array.from(document.querySelectorAll(".analytics-period-btn"));
        periodButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                state.analyticsPeriod = btn.dataset.period || "week";
                periodButtons.forEach((item) => {
                    item.classList.remove("active", "bg-dark-panel", "text-white");
                    item.classList.add("text-dark-muted");
                });
                btn.classList.add("active", "bg-dark-panel", "text-white");
                btn.classList.remove("text-dark-muted");
                renderAnalytics();
                saveState();
            });
        });
        document.getElementById("export-csv-btn").addEventListener("click", exportAnalyticsCsv);
    }

    function bindCommandPalette() {
        const openBtn = document.getElementById("cmd-k-btn");
        const mobileOpenBtn = document.getElementById("mobile-command-btn");
        const palette = document.getElementById("cmd-palette");
        const input = document.getElementById("cmd-input");

        openBtn.addEventListener("click", () => openCommandPalette());
        if (mobileOpenBtn) {
            mobileOpenBtn.addEventListener("click", () => openCommandPalette());
        }
        palette.addEventListener("click", (event) => {
            if (event.target === palette) {
                closeCommandPalette();
            }
        });
        input.addEventListener("input", () => {
            buildCommandResults(input.value.trim().toLowerCase());
            renderCommandResults();
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                moveCommandCursor(1);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveCommandCursor(-1);
            } else if (event.key === "Enter") {
                event.preventDefault();
                executeCommandItem(ui.commandItems[ui.cmdIndex]);
            } else if (event.key === "Escape") {
                closeCommandPalette();
            }
        });

        document.addEventListener("keydown", (event) => {
            const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
            if (isCmdK) {
                event.preventDefault();
                if (ui.commandOpen) {
                    closeCommandPalette();
                } else {
                    openCommandPalette();
                }
            } else if (event.key === "Escape" && ui.commandOpen) {
                closeCommandPalette();
            }
        });
    }

    function openCommandPalette() {
        const palette = document.getElementById("cmd-palette");
        const content = document.getElementById("cmd-palette-content");
        const input = document.getElementById("cmd-input");
        ui.commandOpen = true;
        palette.classList.remove("hidden");
        requestAnimationFrame(() => {
            palette.classList.remove("opacity-0");
            content.classList.remove("scale-95");
        });
        input.value = "";
        buildCommandResults("");
        renderCommandResults();
        input.focus();
    }

    function closeCommandPalette() {
        const palette = document.getElementById("cmd-palette");
        const content = document.getElementById("cmd-palette-content");
        ui.commandOpen = false;
        palette.classList.add("opacity-0");
        content.classList.add("scale-95");
        setTimeout(() => {
            palette.classList.add("hidden");
        }, 160);
    }

    function startStartupLoader() {
        const loader = document.getElementById("startup-loader");
        if (!loader) {
            return;
        }
        window.setTimeout(() => {
            loader.classList.add("is-hiding");
            window.setTimeout(() => {
                loader.remove();
            }, 500);
        }, STARTUP_LOADER_MS);
    }

    function buildCommandResults(query) {
        const pages = [
            { label: "Overview", hint: "Go to dashboard home", action: () => showView("overview"), icon: "ph-squares-four", category: "Page" },
            { label: "Tasks", hint: "Open Kanban board", action: () => showView("tasks"), icon: "ph-check-square-offset", category: "Page" },
            { label: "Focus", hint: "Open Pomodoro timer", action: () => showView("focus"), icon: "ph-target", category: "Page" },
            { label: "Academics", hint: "Subject progress and topics", action: () => showView("academics"), icon: "ph-books", category: "Page" },
            { label: "Extracurriculars", hint: "Projects and ventures", action: () => showView("extracurriculars"), icon: "ph-rocket-launch", category: "Page" },
            { label: "Habits", hint: "Routine and consistency", action: () => showView("habits"), icon: "ph-plant", category: "Page" },
            { label: "Analytics", hint: "Performance trends", action: () => showView("analytics"), icon: "ph-chart-line-up", category: "Page" }
        ];
        const actions = [
            { label: "Create Task", hint: "Open task modal", action: () => openTaskModal(), icon: "ph-plus-circle", category: "Action" },
            { label: "Add Project", hint: "Open project modal", action: () => openProjectModal(), icon: "ph-plus-circle", category: "Action" },
            { label: "Add Habit", hint: "Open habit modal", action: () => openModal("habit-modal"), icon: "ph-plus-circle", category: "Action" },
            { label: "Log Quick Activity", hint: "Jump to overview quick add", action: () => {
                showView("overview");
                document.getElementById("quick-duration")?.focus();
            }, icon: "ph-lightning", category: "Action" },
            { label: "Start Focus Timer", hint: "Start current timer mode", action: () => startFocus(), icon: "ph-play", category: "Action" },
            { label: "Reset Focus Timer", hint: "Reset countdown", action: () => {
                state.focus.status = "ready";
                state.focus.endAt = null;
                state.focus.remainingSeconds = state.focus.modeMinutes * 60;
                renderFocusTimer();
                saveState();
            }, icon: "ph-arrow-counter-clockwise", category: "Action" }
        ];
        const recentTasks = state.tasks.slice(-5).reverse().map((task) => ({
            label: task.title,
            hint: `Task - ${task.subject}`,
            action: () => {
                showView("tasks");
                ui.taskSearch = task.title.toLowerCase();
                const search = document.getElementById("task-search");
                search.value = task.title;
                renderKanban();
            },
            icon: "ph-list-checks",
            category: "Recent"
        }));
        const recentProjects = state.projects.slice(-3).reverse().map((project) => ({
            label: project.name,
            hint: "Project quick jump",
            action: () => showView("extracurriculars"),
            icon: "ph-rocket-launch",
            category: "Recent"
        }));
        const all = [...pages, ...actions, ...recentTasks, ...recentProjects];
        if (!query) {
            ui.commandItems = all;
        } else {
            ui.commandItems = all.filter((item) => fuzzyIncludes(`${item.label} ${item.hint} ${item.category}`.toLowerCase(), query));
        }
        ui.cmdIndex = 0;
    }

    function renderCommandResults() {
        const container = document.getElementById("cmd-results");
        if (!ui.commandItems.length) {
            container.innerHTML = '<div class="px-3 py-6 text-sm text-dark-muted text-center">No matches found.</div>';
            return;
        }
        container.innerHTML = ui.commandItems.map((item, index) => {
            const active = index === ui.cmdIndex ? "active" : "";
            return `
                <button data-index="${index}" class="cmd-item ${active} w-full text-left transition-colors">
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <i class="ph-bold ${item.icon} text-brand-300"></i>
                            <div>
                                <div class="text-sm text-white">${escapeHtml(item.label)}</div>
                                <div class="text-xs text-dark-muted">${escapeHtml(item.hint)}</div>
                            </div>
                        </div>
                        <span class="text-[10px] uppercase tracking-wider text-dark-muted font-mono">${item.category}</span>
                    </div>
                </button>
            `;
        }).join("");
        container.querySelectorAll(".cmd-item").forEach((btn) => {
            btn.addEventListener("click", () => {
                const idx = Number(btn.dataset.index);
                executeCommandItem(ui.commandItems[idx]);
            });
        });
    }

    function moveCommandCursor(delta) {
        if (!ui.commandItems.length) {
            return;
        }
        ui.cmdIndex = (ui.cmdIndex + delta + ui.commandItems.length) % ui.commandItems.length;
        renderCommandResults();
    }

    function executeCommandItem(item) {
        if (!item || typeof item.action !== "function") {
            return;
        }
        item.action();
        closeCommandPalette();
    }

    function onTaskSubmit(event) {
        event.preventDefault();
        const titleInput = document.getElementById("task-title");
        const subjectInput = document.getElementById("task-subject");
        const priorityInput = document.getElementById("task-priority");
        const dateInput = document.getElementById("task-date");
        const description = document.getElementById("task-desc").value.trim();

        const title = titleInput.value.trim();
        const subject = subjectInput.value;
        const priority = priorityInput.value;
        const dueDate = dateInput.value;
        if (!title || !dueDate) {
            return;
        }

        const today = localDateISO(new Date());
        if (dueDate < today) {
            alert("Due date cannot be in the past.");
            return;
        }

        const duplicate = state.tasks.find((task) =>
            task.subject === subject &&
            task.title.toLowerCase() === title.toLowerCase() &&
            task.id !== ui.editingTaskId
        );
        if (duplicate) {
            alert("A task with this title already exists in this subject.");
            return;
        }

        if (ui.editingTaskId) {
            const target = state.tasks.find((task) => task.id === ui.editingTaskId);
            if (target) {
                target.title = title;
                target.description = description;
                target.subject = subject;
                target.priority = priority;
                target.dueDate = dueDate;
            }
            addActivity("ph-note-pencil", `Updated task: ${title}`);
        } else {
            const task = createTask(title, subject, priority, "todo", dueDate, description);
            state.tasks.push(task);
            addActivity("ph-plus-circle", `Created task: ${title}`);
        }

        closeModal("task-modal");
        document.getElementById("task-form").reset();
        ui.editingTaskId = null;
        renderOverview();
        renderKanban();
        renderAnalytics();
        saveState();
    }

    function openTaskModal(task, preset) {
        const titleInput = document.getElementById("task-title");
        const subjectInput = document.getElementById("task-subject");
        const priorityInput = document.getElementById("task-priority");
        const dateInput = document.getElementById("task-date");
        const descInput = document.getElementById("task-desc");
        const heading = document.querySelector("#task-modal h3");
        const submitBtn = document.querySelector("#task-form button[type='submit']");
        if (task) {
            ui.editingTaskId = task.id;
            titleInput.value = task.title;
            descInput.value = task.description || "";
            subjectInput.value = task.subject;
            priorityInput.value = task.priority;
            dateInput.value = task.dueDate;
            heading.textContent = "Edit Task";
            submitBtn.textContent = "Save Changes";
        } else {
            ui.editingTaskId = null;
            document.getElementById("task-form").reset();
            descInput.value = "";
            dateInput.value = localDateISO(new Date());
            if (preset) {
                titleInput.value = preset.title || "";
                descInput.value = preset.description || "";
                subjectInput.value = preset.subject || "Projects";
                priorityInput.value = preset.priority || "Medium";
                if (preset.dueDate) {
                    dateInput.value = preset.dueDate;
                }
            }
            heading.textContent = "Create Task";
            submitBtn.textContent = "Add Task";
        }
        openModal("task-modal");
    }

    function openProjectModal(project) {
        const name = document.getElementById("project-name");
        const desc = document.getElementById("project-desc");
        const status = document.getElementById("project-status");
        const link = document.getElementById("project-link");
        const heading = document.querySelector("#project-modal h3");
        const submitBtn = document.querySelector("#project-form button[type='submit']");
        if (project) {
            ui.editingProjectId = project.id;
            name.value = project.name;
            desc.value = project.description;
            status.value = normalizeProjectStatusLabel(project.status);
            link.value = project.url || "";
            heading.textContent = "Edit Project";
            submitBtn.textContent = "Save Changes";
        } else {
            ui.editingProjectId = null;
            document.getElementById("project-form").reset();
            heading.textContent = "Add Project";
            submitBtn.textContent = "Add Project";
        }
        openModal("project-modal");
    }

    function onProjectSubmit(event) {
        event.preventDefault();
        const nameInput = document.getElementById("project-name");
        const descInput = document.getElementById("project-desc");
        const statusInput = document.getElementById("project-status");
        const linkInput = document.getElementById("project-link");

        const projectName = nameInput.value.trim();
        if (!projectName) {
            return;
        }
        const normalizedStatus = normalizeProjectStatusValue(statusInput.value);
        if (ui.editingProjectId) {
            const target = state.projects.find((item) => item.id === ui.editingProjectId);
            if (target) {
                target.name = projectName;
                target.description = descInput.value.trim();
                target.status = normalizedStatus;
                target.url = linkInput.value.trim();
            }
            addActivity("ph-note-pencil", `Updated project: ${projectName}`);
        } else {
            state.projects.push({
                id: uid("proj"),
                name: projectName,
                description: descInput.value.trim(),
                icon: "🚀",
                status: normalizedStatus,
                progress: normalizedStatus === "planning" ? 10 : normalizedStatus === "in-progress" ? 35 : normalizedStatus === "active" ? 70 : 100,
                techStack: ["Custom"],
                url: linkInput.value.trim(),
                milestones: [],
                createdAt: new Date().toISOString()
            });
            addActivity("ph-plus-circle", `Added project: ${projectName}`);
        }
        closeModal("project-modal");
        document.getElementById("project-form").reset();
        ui.editingProjectId = null;
        renderProjects();
        renderOverview();
        saveState();
    }

    function clearCompletedTasks() {
        const completedCount = state.tasks.filter((task) => task.status === "done").length;
        if (!completedCount) {
            window.alert("There are no completed tasks to clear.");
            return;
        }
        if (!window.confirm(`Clear ${completedCount} completed task${completedCount === 1 ? "" : "s"}?`)) {
            return;
        }
        state.tasks = state.tasks.filter((task) => task.status !== "done");
        addActivity("ph-broom", `Cleared ${completedCount} completed task${completedCount === 1 ? "" : "s"}`);
        renderOverview();
        renderKanban();
        renderAnalytics();
        saveState();
    }

    function resetProgressToFreshStart() {
        if (!window.confirm("Reset LifeOS progress for a fresh start? This will reopen tasks, clear completions, reset focus history, and wipe tracked progress.")) {
            return;
        }
        state = createFreshStartState();
        ui.editingTaskId = null;
        ui.editingProjectId = null;
        ui.taskSearch = "";
        ui.taskFilter = "All";
        saveState();
        renderAll();
        syncTaskFilterUi();
    }

    function createFreshStartState() {
        const base = createDefaultState();
        const nowIso = new Date().toISOString();
        base.tasks = base.tasks.map((task) => ({
            ...task,
            status: "todo",
            completedAt: null,
            createdAt: nowIso
        }));
        base.habits = base.habits.map((habit) => ({
            ...habit,
            completions: {}
        }));
        base.timeBlocks = base.timeBlocks.map((block) => ({
            ...block,
            completions: {}
        }));
        base.projects = base.projects.map((project) => ({
            ...project,
            progress: 0,
            milestones: (project.milestones || []).map((milestone) => ({
                ...milestone,
                completed: false
            }))
        }));
        base.subjects = base.subjects.map((subject) => ({
            ...subject,
            topics: subject.topics.map((topic) => ({
                ...topic,
                status: "not-started"
            }))
        }));
        base.focus = {
            modeMinutes: 25,
            remainingSeconds: 1500,
            status: "ready",
            endAt: null,
            sessions: [],
            totalCompletedSeconds: 0
        };
        base.activityLogs = [];
        base.activity = [
            createActivity("ph-arrow-counter-clockwise", "Started a fresh LifeOS cycle", new Date())
        ];
        base.overviewOrder = [];
        base.analyticsPeriod = "week";
        return base;
    }

    function syncTaskFilterUi() {
        document.querySelectorAll(".filter-btn").forEach((btn) => {
            const active = (btn.dataset.subject || "All") === ui.taskFilter;
            btn.classList.toggle("active", active);
            btn.classList.toggle("bg-dark-panel", active);
            btn.classList.toggle("text-white", active);
            btn.classList.toggle("bg-transparent", !active);
            btn.classList.toggle("text-dark-muted", !active);
        });
        const search = document.getElementById("task-search");
        if (search) {
            search.value = ui.taskSearch;
        }
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        const content = modal.querySelector("div");
        modal.classList.remove("hidden");
        requestAnimationFrame(() => {
            modal.classList.remove("opacity-0");
            content.classList.remove("scale-95");
        });
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        const content = modal.querySelector("div");
        modal.classList.add("opacity-0");
        content.classList.add("scale-95");
        setTimeout(() => {
            modal.classList.add("hidden");
        }, 160);
    }

    function attachModalDismiss(modalId, closeId) {
        const modal = document.getElementById(modalId);
        const closeBtn = document.getElementById(closeId);
        closeBtn.addEventListener("click", () => closeModal(modalId));
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                closeModal(modalId);
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !modal.classList.contains("hidden")) {
                closeModal(modalId);
            }
        });
    }

    function initKanbanSortables() {
        if (!window.Sortable) {
            return;
        }
        Object.entries(STATUS_COLUMNS).forEach(([status, elementId]) => {
            const target = document.getElementById(elementId);
            ui.sortables[status] = new window.Sortable(target, {
                group: "lifeos-kanban",
                animation: 140,
                ghostClass: "dragging",
                draggable: ".task-card",
                onAdd: (evt) => {
                    const taskId = evt.item.dataset.id;
                    const task = state.tasks.find((item) => item.id === taskId);
                    if (!task) {
                        return;
                    }
                    task.status = status;
                    if (status === "done" && !task.completedAt) {
                        task.completedAt = new Date().toISOString();
                        addActivity("ph-check-circle", `Completed task: ${task.title}`);
                    }
                    if (status !== "done") {
                        task.completedAt = null;
                    }
                    saveState();
                    renderOverview();
                    renderKanban();
                    renderAnalytics();
                }
            });
        });
    }

    function initPrioritySortable() {
        if (!window.Sortable) {
            return;
        }
        const list = document.getElementById("overview-tasks");
        ui.prioritySortable = new window.Sortable(list, {
            animation: 140,
            draggable: ".priority-item",
            handle: ".priority-handle",
            onEnd: () => {
                const ids = Array.from(list.querySelectorAll(".priority-item")).map((item) => item.dataset.id);
                state.overviewOrder = ids;
                saveState();
            }
        });
    }

    function renderAll() {
        showView(ui.currentView);
        renderOverview();
        renderKanban();
        renderFocusTimer();
        renderAcademics();
        renderProjects();
        renderHabits();
        renderAnalytics();
    }

    function renderOverview() {
        renderOverviewPriorities();
        renderMiniCalendar();
        renderOverviewStats();
        renderDailyRoutineWidget();
        renderActivity();
    }

    function renderOverviewPriorities() {
        const list = document.getElementById("overview-tasks");
        const tasks = state.tasks
            .filter((task) => task.status !== "done")
            .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.dueDate.localeCompare(b.dueDate))
            .slice(0, 8);

        const byId = new Map(tasks.map((task) => [task.id, task]));
        const ordered = [];
        state.overviewOrder.forEach((id) => {
            if (byId.has(id)) {
                ordered.push(byId.get(id));
                byId.delete(id);
            }
        });
        byId.forEach((value) => ordered.push(value));

        if (!ordered.length) {
            list.innerHTML = '<div class="text-sm text-dark-muted italic">No active priorities. Time to add one.</div>';
            return;
        }
        list.innerHTML = ordered.slice(0, 5).map((task) => {
            const meta = SUBJECT_META[task.subject] || SUBJECT_META.Personal;
            return `
                <div class="priority-item flex items-center gap-3 p-3 rounded-xl border border-dark-border/80 bg-dark-bg/50" data-id="${task.id}">
                    <button class="priority-handle text-dark-muted hover:text-white"><i class="ph-bold ph-dots-six-vertical"></i></button>
                    <div class="w-2 h-2 rounded-full" style="background:${meta.color}"></div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-white truncate">${escapeHtml(task.title)}</div>
                        <div class="text-[11px] text-dark-muted">${task.subject} • Due ${formatShortDate(task.dueDate)}</div>
                    </div>
                    <span class="priority-badge" style="background:${priorityColor(task.priority).bg}; color:${priorityColor(task.priority).color};">${task.priority}</span>
                </div>
            `;
        }).join("");
    }

    function renderOverviewStats() {
        const focusStat = document.getElementById("stat-focus-time");
        const taskStat = document.getElementById("stat-tasks-done");
        const streakStat = document.getElementById("stat-current-streak");
        const today = localDateISO(new Date());
        const completedToday = state.tasks.filter((task) => task.completedAt && localDateISO(new Date(task.completedAt)) === today).length;
        const totalToday = state.tasks.filter((task) => task.dueDate === today).length || state.tasks.length;
        const focusMinutes = getTodayFocusMinutes();
        focusStat.textContent = `${Math.floor(focusMinutes / 60)}h ${String(focusMinutes % 60).padStart(2, "0")}m`;
        taskStat.innerHTML = `${completedToday}<span class="text-sm text-dark-muted font-normal ml-1">/ ${totalToday}</span>`;
        streakStat.innerHTML = `${computeHabitStreak()} <span class="text-sm text-dark-muted font-normal ml-1">days</span>`;
    }

    function renderDailyRoutineWidget() {
        const list = document.getElementById("timeblock-list");
        if (!list || !Array.isArray(state.timeBlocks)) {
            return;
        }
        const now = new Date();
        const today = localDateISO(now);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const blocks = state.timeBlocks.slice().sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        let completedCount = 0;
        const missed = [];
        let nextBlock = null;
        let activeBlock = null;

        const rows = blocks.map((block) => {
            const startM = toMinutes(block.start);
            const endM = toMinutes(block.end);
            const done = Boolean(block.completions && block.completions[today]);
            if (done) {
                completedCount += 1;
            }
            const isActive = nowMinutes >= startM && nowMinutes < endM;
            const isMissed = nowMinutes >= endM && !done;
            const isUpcoming = nowMinutes < startM;
            if (isActive) {
                activeBlock = block;
            }
            if (!nextBlock && isUpcoming) {
                nextBlock = block;
            }
            if (isMissed) {
                missed.push(block.title);
            }
            const cls = done ? "done" : isMissed ? "missed" : isActive ? "active" : "";
            const status = done ? "Completed" : isMissed ? "Missed" : isActive ? "In Progress" : "Upcoming";
            return `
                <div class="timeblock-row ${cls}">
                    <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                            <div class="text-sm text-white">${escapeHtml(block.title)}</div>
                            <div class="text-[11px] text-dark-muted">${block.start} - ${block.end} • ${block.domain}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[11px] ${done ? "text-emerald-300" : isMissed ? "text-red-300" : "text-dark-muted"}">${status}</div>
                            <button class="text-[10px] font-mono mt-1 px-2 py-1 rounded border border-dark-border text-dark-muted hover:text-white hover:border-brand-500/40" data-timeblock-id="${block.id}">
                                ${done ? "Undo" : "Complete"}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        list.innerHTML = rows.join("");
        const percent = Math.round((completedCount / Math.max(blocks.length, 1)) * 100);
        document.getElementById("routine-compliance-text").textContent = `${percent}%`;
        document.getElementById("routine-compliance-bar").style.width = `${percent}%`;

        const label = document.getElementById("next-timeblock-label");
        const countdown = document.getElementById("next-timeblock-countdown");
        if (activeBlock) {
            label.textContent = `Current: ${activeBlock.title}`;
            countdown.textContent = `Ends in ${durationToClock(Math.max(0, toMinutes(activeBlock.end) - nowMinutes) * 60 - now.getSeconds())}`;
        } else if (nextBlock) {
            label.textContent = `Next: ${nextBlock.title}`;
            const secs = (toMinutes(nextBlock.start) - nowMinutes) * 60 - now.getSeconds();
            countdown.textContent = `Starts in ${durationToClock(Math.max(0, secs))}`;
        } else {
            label.textContent = "All blocks finished";
            countdown.textContent = "See you tomorrow";
        }

        const banner = document.getElementById("routine-alert-banner");
        if (missed.length) {
            banner.classList.remove("hidden");
            banner.textContent = `Missed ${missed.length} routine block${missed.length > 1 ? "s" : ""}: ${missed.slice(0, 2).join(", ")}${missed.length > 2 ? "..." : ""}`;
        } else {
            banner.classList.add("hidden");
            banner.textContent = "";
        }

        list.querySelectorAll("[data-timeblock-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                toggleTimeBlockCompletion(btn.dataset.timeblockId, today);
            });
        });
    }

    function renderMiniCalendar() {
        const calendar = document.getElementById("mini-calendar");
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        const startDay = first.getDay();
        const daysInMonth = last.getDate();
        const examDays = new Set(
            state.subjects.flatMap((subject) => subject.exams || []).map((exam) => exam.date)
        );
        const labels = ["S", "M", "T", "W", "T", "F", "S"];
        const cells = [];
        for (let i = 0; i < startDay; i += 1) {
            cells.push('<div class="h-8"></div>');
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = localDateISO(new Date(year, month, day));
            const isToday = date === localDateISO(now);
            const hasExam = examDays.has(date);
            cells.push(`
                <button data-date="${date}" class="h-8 w-8 text-xs rounded-lg border transition-colors ${isToday ? "border-brand-500 text-brand-300 bg-brand-500/10" : "border-transparent text-dark-text hover:border-dark-border"} ${hasExam ? "ring-1 ring-emerald-400/70" : ""}">
                    ${day}
                </button>
            `);
        }
        calendar.innerHTML = `
            <div class="text-xs text-dark-muted font-mono mb-2">${now.toLocaleDateString([], { month: "long", year: "numeric" })}</div>
            <div class="grid grid-cols-7 gap-1 mb-1">
                ${labels.map((d) => `<div class="text-[10px] text-dark-muted text-center">${d}</div>`).join("")}
            </div>
            <div class="grid grid-cols-7 gap-1">
                ${cells.join("")}
            </div>
        `;
        calendar.querySelectorAll("button[data-date]").forEach((btn) => {
            btn.addEventListener("click", () => {
                showView("tasks");
                const search = document.getElementById("task-search");
                search.value = "";
                ui.taskSearch = "";
                renderKanban(btn.dataset.date);
            });
        });
    }

    function renderActivity() {
        const container = document.getElementById("recent-activity-list");
        const sorted = [...state.activity].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6);
        container.innerHTML = sorted.map((item) => `
            <div class="flex items-center gap-4 text-sm">
                <div class="w-8 h-8 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center">
                    <i class="ph-bold ${item.icon} text-dark-muted"></i>
                </div>
                <div class="flex-1">
                    <p class="text-white">${escapeHtml(item.text)}</p>
                    <p class="text-xs text-dark-muted">${relativeTime(item.timestamp)}</p>
                </div>
            </div>
        `).join("");
    }

    function renderKanban(forcedDate) {
        const columns = {
            todo: document.getElementById("kanban-todo"),
            "in-progress": document.getElementById("kanban-progress"),
            done: document.getElementById("kanban-done")
        };

        Object.values(columns).forEach((column) => {
            column.innerHTML = "";
        });

        const tasks = state.tasks.filter((task) => {
            const subjectMatch = ui.taskFilter === "All" ? true : task.subject === ui.taskFilter;
            const searchMatch = ui.taskSearch ? task.title.toLowerCase().includes(ui.taskSearch) : true;
            const dateMatch = forcedDate ? task.dueDate === forcedDate : true;
            return subjectMatch && searchMatch && dateMatch;
        });

        tasks.forEach((task) => {
            const col = columns[task.status];
            if (!col) {
                return;
            }
            col.insertAdjacentHTML("beforeend", renderTaskCard(task));
        });

        Object.entries(columns).forEach(([status, col]) => {
            if (!col.children.length) {
                col.innerHTML = '<div class="empty-column">Drop tasks here</div>';
            }
            const header = col.parentElement.querySelector("h3");
            const count = tasks.filter((task) => task.status === status).length;
            const base = STATUS_LABELS[status];
            const dot = status === "todo" ? "bg-blue-500" : status === "in-progress" ? "bg-orange-500" : "bg-emerald-500";
            header.innerHTML = `<div class="w-2 h-2 rounded-full ${dot}"></div> ${base} <span class="kanban-count">(${count})</span>`;
        });

        document.querySelectorAll("[data-task-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                const action = btn.dataset.taskAction;
                const task = state.tasks.find((item) => item.id === id);
                if (!task) {
                    return;
                }
                if (action === "edit") {
                    openTaskModal(task);
                } else if (action === "duplicate") {
                    const copy = { ...task, id: uid("task"), title: `${task.title} (copy)`, createdAt: new Date().toISOString(), completedAt: null, status: "todo" };
                    state.tasks.push(copy);
                    addActivity("ph-copy", `Duplicated task: ${task.title}`);
                    renderKanban();
                    renderOverview();
                    saveState();
                } else if (action === "delete") {
                    if (window.confirm(`Delete "${task.title}"?`)) {
                        state.tasks = state.tasks.filter((item) => item.id !== id);
                        addActivity("ph-trash", `Deleted task: ${task.title}`);
                        renderKanban();
                        renderOverview();
                        renderAnalytics();
                        saveState();
                    }
                } else if (action === "complete") {
                    task.status = "done";
                    task.completedAt = new Date().toISOString();
                    addActivity("ph-check-circle", `Completed task: ${task.title}`);
                    renderKanban();
                    renderOverview();
                    renderAnalytics();
                    saveState();
                }
            });
        });
    }

    function renderTaskCard(task) {
        const subject = SUBJECT_META[task.subject] || SUBJECT_META.Personal;
        const dueSoon = task.dueDate <= addDaysISO(new Date(), 1) && task.status !== "done";
        return `
            <article class="task-card ${task.status === "done" ? "done" : ""}" data-id="${task.id}">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <h4 class="task-title text-sm font-medium text-white leading-tight">${escapeHtml(task.title)}</h4>
                        ${task.description ? `<p class="text-xs text-dark-muted mt-1 line-clamp-2">${escapeHtml(task.description)}</p>` : ""}
                    </div>
                    <div class="flex items-center gap-1">
                        <button data-task-action="edit" data-id="${task.id}" class="text-dark-muted hover:text-white p-1"><i class="ph ph-pencil-simple"></i></button>
                        <button data-task-action="duplicate" data-id="${task.id}" class="text-dark-muted hover:text-white p-1"><i class="ph ph-copy"></i></button>
                        <button data-task-action="delete" data-id="${task.id}" class="text-dark-muted hover:text-red-400 p-1"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <span class="subject-badge" style="background:${subject.bg}; color:${subject.color};">${task.subject}</span>
                    <span class="priority-badge" style="background:${priorityColor(task.priority).bg}; color:${priorityColor(task.priority).color};">${task.priority}</span>
                    <span class="status-pill ${dueSoon ? "text-orange-300 bg-orange-500/15" : "text-dark-muted bg-dark-border/60"}">Due ${formatShortDate(task.dueDate)}</span>
                </div>
                ${task.status !== "done" ? `
                    <div class="mt-3">
                        <button data-task-action="complete" data-id="${task.id}" class="w-full text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 py-1.5 hover:bg-emerald-500/15 transition-colors">
                            Mark Complete
                        </button>
                    </div>
                ` : ""}
            </article>
        `;
    }

    function startFocus() {
        if (state.focus.status === "running") {
            return;
        }
        if (state.focus.remainingSeconds <= 0) {
            state.focus.remainingSeconds = state.focus.modeMinutes * 60;
        }
        state.focus.status = "running";
        state.focus.endAt = Date.now() + state.focus.remainingSeconds * 1000;
        requestNotificationPermission();
        renderFocusTimer();
        saveState();
    }

    function pauseFocus() {
        if (state.focus.status !== "running") {
            return;
        }
        const remaining = Math.max(0, Math.ceil((state.focus.endAt - Date.now()) / 1000));
        state.focus.remainingSeconds = remaining;
        state.focus.status = "paused";
        state.focus.endAt = null;
        renderFocusTimer();
        saveState();
    }

    function tickFocusTimer() {
        if (state.focus.status !== "running" || !state.focus.endAt) {
            return;
        }
        const remaining = Math.max(0, Math.ceil((state.focus.endAt - Date.now()) / 1000));
        state.focus.remainingSeconds = remaining;
        if (remaining <= 0) {
            state.focus.status = "completed";
            state.focus.endAt = null;
            state.focus.remainingSeconds = 0;
            const sessionMinutes = state.focus.modeMinutes;
            const completedAt = new Date().toISOString();
            state.focus.sessions.push({ id: uid("session"), durationMinutes: sessionMinutes, completedAt });
            state.focus.totalCompletedSeconds += sessionMinutes * 60;
            addActivity("ph-target", `Completed ${sessionMinutes}m focus session`);
            chime();
            sendCompletionNotification(sessionMinutes);
        }
        renderFocusTimer();
        saveState();
    }

    function renderFocusTimer() {
        const display = document.getElementById("timer-display");
        const status = document.getElementById("timer-status");
        const toggle = document.getElementById("timer-toggle");
        const progress = document.getElementById("timer-progress");
        const circleLen = 753.98;
        const total = state.focus.modeMinutes * 60;
        const remaining = Math.min(total, Math.max(0, state.focus.remainingSeconds));
        const elapsedRatio = total ? (total - remaining) / total : 0;
        const mm = Math.floor(remaining / 60);
        const ss = remaining % 60;
        display.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
        status.textContent = state.focus.status === "completed" ? "Break Time" : capitalize(state.focus.status);
        progress.style.strokeDashoffset = String(circleLen * elapsedRatio);
        toggle.innerHTML = state.focus.status === "running"
            ? '<i class="ph-fill ph-pause text-2xl"></i>'
            : '<i class="ph-fill ph-play text-2xl"></i>';
    }

    function renderAcademics() {
        const container = document.getElementById("academics-grid");
        container.innerHTML = state.subjects.map((subject) => {
            const progress = computeSubjectProgress(subject);
            const nextExam = nextExamForSubject(subject);
            return `
                <article class="glass-panel rounded-2xl p-5">
                    <div class="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                                <span>${subject.icon}</span>
                                <span>${subject.name}</span>
                            </h3>
                            <p class="text-xs text-dark-muted mt-1">Next exam: ${nextExam ? `${formatShortDate(nextExam.date)} (${nextExam.paper})` : "N/A"}</p>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-brand-300 font-mono">${progress}%</div>
                            <div class="text-[10px] uppercase tracking-wider text-dark-muted">Progress</div>
                        </div>
                    </div>
                    <div class="h-2 rounded-full bg-dark-border mb-4 overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style="width:${progress}%"></div>
                    </div>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${subject.papers.map((paper) => `<button class="chip-btn">${escapeHtml(paper)}</button>`).join("")}
                    </div>
                    <details class="mb-4">
                        <summary class="text-sm text-white cursor-pointer">Topics (${subject.topics.length})</summary>
                        <div class="space-y-2 mt-3 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                            ${subject.topics.map((topic) => `
                                <div class="topic-item flex items-center justify-between gap-2">
                                    <div class="min-w-0">
                                        <div class="text-sm text-white truncate">${escapeHtml(topic.name)}</div>
                                        <div class="text-[11px] text-dark-muted">${TOPIC_LABELS[topic.status]}</div>
                                    </div>
                                    <button data-topic-id="${topic.id}" data-subject-id="${subject.id}" class="text-xs px-2 py-1 rounded-lg border border-dark-border text-dark-muted hover:text-white hover:border-brand-500/40">
                                        Cycle
                                    </button>
                                </div>
                            `).join("")}
                        </div>
                    </details>
                    <div class="grid grid-cols-3 gap-2">
                        ${subject.mockScores.map((score, idx) => `
                            <div class="rounded-lg bg-dark-bg/70 border border-dark-border px-2 py-1.5 text-center">
                                <div class="text-xs text-dark-muted">Mock ${idx + 1}</div>
                                <div class="text-sm font-mono text-white">${score}%</div>
                            </div>
                        `).join("")}
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-topic-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const subject = state.subjects.find((item) => item.id === btn.dataset.subjectId);
                if (!subject) {
                    return;
                }
                const topic = subject.topics.find((item) => item.id === btn.dataset.topicId);
                if (!topic) {
                    return;
                }
                const idx = TOPIC_STATES.indexOf(topic.status);
                topic.status = TOPIC_STATES[(idx + 1) % TOPIC_STATES.length];
                addActivity("ph-books", `${subject.name}: ${topic.name} -> ${TOPIC_LABELS[topic.status]}`);
                renderAcademics();
                renderOverview();
                saveState();
            });
        });
    }

    function renderAcademics() {
        const container = document.getElementById("academics-grid");
        container.innerHTML = state.subjects.map((subject) => {
            const progress = computeSubjectProgress(subject);
            const nextExam = nextExamForSubject(subject);
            const remaining = subject.topics.filter((topic) => topic.status !== "expert").length;
            return `
                <article class="glass-panel rounded-2xl p-5">
                    <div class="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                                <span>${escapeHtml(subject.icon)}</span>
                                <span>${escapeHtml(subject.name)}</span>
                            </h3>
                            <p class="text-xs text-dark-muted mt-1">Next exam: ${nextExam ? `${formatShortDate(nextExam.date)} (${escapeHtml(nextExam.paper)})` : "N/A"} • ${remaining} topics still below expert</p>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-brand-300 font-mono">${progress}%</div>
                            <div class="text-[10px] uppercase tracking-wider text-dark-muted">Readiness</div>
                        </div>
                    </div>
                    <div class="h-2 rounded-full bg-dark-border mb-4 overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style="width:${progress}%"></div>
                    </div>
                    <div class="space-y-3 max-h-[28rem] overflow-y-auto custom-scrollbar pr-1">
                        ${subject.papers.map((paper) => `
                            <details class="rounded-xl border border-dark-border bg-dark-bg/50 p-3" open>
                                <summary class="cursor-pointer list-none">
                                    <div class="flex items-center justify-between gap-3">
                                        <div>
                                            <div class="text-sm text-white">${escapeHtml(paper.name)}</div>
                                            <div class="text-[11px] text-dark-muted">${paper.level} • ${paper.duration} • ${paper.session}</div>
                                        </div>
                                        <div class="text-[11px] text-brand-300 font-mono">${paper.topicIds.length} topics</div>
                                    </div>
                                </summary>
                                <div class="space-y-2 mt-3">
                                    ${paper.topicIds.map((topicId) => {
                                        const topic = subject.topics.find((item) => item.id === topicId);
                                        if (!topic) {
                                            return "";
                                        }
                                        return `
                                            <div class="topic-item flex items-start justify-between gap-2">
                                                <div class="min-w-0">
                                                    <div class="text-sm text-white">${escapeHtml(topic.name)}</div>
                                                    <div class="text-[11px] text-dark-muted mt-1">${escapeHtml(topic.subtopics.join(", "))}</div>
                                                    <div class="text-[10px] uppercase tracking-wider text-brand-300 mt-2">${TOPIC_LABELS[topic.status]}</div>
                                                </div>
                                                <button data-topic-id="${topic.id}" data-subject-id="${subject.id}" class="text-xs px-2 py-1 rounded-lg border border-dark-border text-dark-muted hover:text-white hover:border-brand-500/40">
                                                    Cycle
                                                </button>
                                            </div>
                                        `;
                                    }).join("")}
                                </div>
                            </details>
                        `).join("")}
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-4">
                        ${subject.mockScores.map((score, idx) => `
                            <div class="rounded-lg bg-dark-bg/70 border border-dark-border px-2 py-1.5 text-center">
                                <div class="text-xs text-dark-muted">Mock ${idx + 1}</div>
                                <div class="text-sm font-mono text-white">${score}%</div>
                            </div>
                        `).join("")}
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-topic-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const subject = state.subjects.find((item) => item.id === btn.dataset.subjectId);
                if (!subject) {
                    return;
                }
                const topic = subject.topics.find((item) => item.id === btn.dataset.topicId);
                if (!topic) {
                    return;
                }
                const idx = TOPIC_STATES.indexOf(topic.status);
                topic.status = TOPIC_STATES[(idx + 1) % TOPIC_STATES.length];
                addActivity("ph-books", `${subject.name}: ${topic.name} -> ${TOPIC_LABELS[topic.status]}`);
                renderAcademics();
                renderOverview();
                saveState();
            });
        });
    }

    function renderProjects() {
        const grid = document.getElementById("projects-grid");
        grid.innerHTML = state.projects.map((project) => {
            const statusLabel = normalizeProjectStatusLabel(project.status);
            return `
                <article class="glass-panel rounded-2xl p-5 flex flex-col gap-4">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h3 class="text-base font-semibold text-white flex items-center gap-2">
                                <span>${project.icon || "🚀"}</span>
                                <span>${escapeHtml(project.name)}</span>
                            </h3>
                            <p class="text-xs text-dark-muted mt-1 line-clamp-2">${escapeHtml(project.description || "")}</p>
                        </div>
                        <div class="flex items-center gap-1">
                            <button data-project-action="edit" data-id="${project.id}" class="text-dark-muted hover:text-white p-1"><i class="ph ph-pencil-simple"></i></button>
                            <button data-project-action="delete" data-id="${project.id}" class="text-dark-muted hover:text-red-400 p-1"><i class="ph ph-trash"></i></button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="status-pill status-${project.status}">${statusLabel}</span>
                        <span class="text-xs text-dark-muted font-mono">${project.progress}%</span>
                    </div>
                    <div class="h-2 rounded-full bg-dark-border overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style="width:${project.progress}%"></div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${(project.techStack || []).map((tech) => `<span class="subject-badge bg-dark-bg text-dark-muted border border-dark-border">${escapeHtml(tech)}</span>`).join("")}
                    </div>
                    <button data-project-action="task" data-id="${project.id}" class="w-full text-xs rounded-lg border border-brand-500/35 bg-brand-500/10 text-brand-300 py-1.5 hover:bg-brand-500/15 transition-colors">
                        Add Task For This Project
                    </button>
                    <div class="space-y-2">
                        ${(project.milestones || []).slice(0, 3).map((milestone) => `
                            <label class="flex items-center gap-2 text-xs text-dark-muted">
                                <input type="checkbox" data-milestone-id="${milestone.id}" data-project-id="${project.id}" ${milestone.completed ? "checked" : ""} class="accent-emerald-500">
                                <span class="${milestone.completed ? "line-through text-emerald-300" : ""}">${escapeHtml(milestone.title)}</span>
                            </label>
                        `).join("")}
                    </div>
                    ${project.url ? `<a href="${escapeHtml(project.url)}" target="_blank" class="text-xs text-brand-300 hover:text-brand-200 inline-flex items-center gap-1">Open Project <i class="ph ph-arrow-up-right"></i></a>` : ""}
                </article>
            `;
        }).join("");

        grid.querySelectorAll("[data-project-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const project = state.projects.find((item) => item.id === btn.dataset.id);
                if (!project) {
                    return;
                }
                if (btn.dataset.projectAction === "edit") {
                    openProjectModal(project);
                } else if (btn.dataset.projectAction === "task") {
                    openTaskModal(null, {
                        subject: "Projects",
                        priority: project.status === "in-progress" || project.status === "active" ? "High" : "Medium",
                        title: `${project.name}: `,
                        description: project.description || "",
                        dueDate: addDaysISO(new Date(), 3)
                    });
                } else if (btn.dataset.projectAction === "delete" && window.confirm(`Delete project "${project.name}"?`)) {
                    state.projects = state.projects.filter((item) => item.id !== project.id);
                    addActivity("ph-trash", `Deleted project: ${project.name}`);
                    renderProjects();
                    renderOverview();
                    saveState();
                }
            });
        });

        grid.querySelectorAll("[data-milestone-id]").forEach((input) => {
            input.addEventListener("change", () => {
                const project = state.projects.find((item) => item.id === input.dataset.projectId);
                if (!project) {
                    return;
                }
                const milestone = project.milestones.find((item) => item.id === input.dataset.milestoneId);
                if (!milestone) {
                    return;
                }
                milestone.completed = input.checked;
                const completedCount = project.milestones.filter((item) => item.completed).length;
                project.progress = Math.round((completedCount / Math.max(project.milestones.length, 1)) * 100);
                addActivity("ph-flag-checkered", `${project.name}: ${milestone.title} ${input.checked ? "completed" : "re-opened"}`);
                renderProjects();
                saveState();
            });
        });
    }

    function renderHabits() {
        const list = document.getElementById("habits-list");
        const today = localDateISO(new Date());
        list.innerHTML = state.habits.map((habit) => {
            const done = Boolean(habit.completions && habit.completions[today]);
            return `
                <label class="habit-row ${done ? "done" : ""} flex items-center justify-between gap-4 p-3 rounded-xl border border-dark-border/80 bg-dark-bg/45">
                    <div class="flex items-center gap-3 min-w-0">
                        <input data-habit-id="${habit.id}" type="checkbox" ${done ? "checked" : ""} class="accent-emerald-500">
                        <div class="min-w-0">
                            <div class="text-sm text-white truncate">${escapeHtml(habit.name)}</div>
                            <div class="text-xs text-dark-muted">${habit.category} ${habit.timeOfDay ? `• ${habit.timeOfDay}` : ""}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-mono text-brand-300">${habitStreak(habit)}d</div>
                        <div class="text-[10px] uppercase tracking-wider text-dark-muted">Streak</div>
                    </div>
                </label>
            `;
        }).join("");

        list.querySelectorAll("[data-habit-id]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const habit = state.habits.find((item) => item.id === checkbox.dataset.habitId);
                if (!habit) {
                    return;
                }
                habit.completions = habit.completions || {};
                if (checkbox.checked) {
                    habit.completions[today] = true;
                } else {
                    delete habit.completions[today];
                }
                addActivity("ph-plant", `${habit.name}: ${checkbox.checked ? "completed" : "unchecked"} for today`);
                renderHabits();
                renderOverview();
                renderAnalytics();
                saveState();
            });
        });

        renderHabitHeatmap();
    }

    function renderHabitHeatmap() {
        const heatmap = document.getElementById("habit-heatmap");
        const days = 30;
        const cells = [];
        for (let i = days - 1; i >= 0; i -= 1) {
            const date = addDaysISO(new Date(), -i);
            const rate = completionRateForDay(date);
            const level = rate >= 0.8 ? 2 : rate >= 0.35 ? 1 : 0;
            cells.push(`
                <button class="heatmap-cell level-${level}" data-date="${date}" title="${date}: ${Math.round(rate * 100)}% complete"></button>
            `);
        }
        heatmap.innerHTML = cells.join("");
        heatmap.querySelectorAll(".heatmap-cell").forEach((cell) => {
            cell.addEventListener("click", () => {
                cycleHeatmapDay(cell.dataset.date);
            });
        });
    }

    function cycleHeatmapDay(date) {
        const rate = completionRateForDay(date);
        const currentLevel = rate >= 0.8 ? 2 : rate >= 0.35 ? 1 : 0;
        const next = (currentLevel + 1) % 3;
        state.habits.forEach((habit, idx) => {
            habit.completions = habit.completions || {};
            if (next === 0) {
                delete habit.completions[date];
            } else if (next === 1) {
                if (idx % 2 === 0) {
                    habit.completions[date] = true;
                } else {
                    delete habit.completions[date];
                }
            } else {
                habit.completions[date] = true;
            }
        });
        addActivity("ph-calendar-check", `Updated habit completion level for ${date}`);
        renderHabits();
        renderOverview();
        renderAnalytics();
        saveState();
    }

    function renderAnalytics() {
        const focusCtx = document.getElementById("focusChart");
        const tasksCtx = document.getElementById("tasksChart");
        const domainCtx = document.getElementById("domainChart");
        if (!focusCtx || !tasksCtx || !domainCtx || !window.Chart) {
            return;
        }

        const period = state.analyticsPeriod || "week";
        const days = period === "week" ? 7 : period === "month" ? 30 : 365;
        const trend = focusTrend(days);
        const labels = trend.map((item) => item.label);
        const values = trend.map((item) => item.hours);
        const taskData = taskCompletionBySubject();

        if (ui.charts.focus) {
            ui.charts.focus.destroy();
        }
        if (ui.charts.tasks) {
            ui.charts.tasks.destroy();
        }
        if (ui.charts.domain) {
            ui.charts.domain.destroy();
        }

        ui.charts.focus = new window.Chart(focusCtx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Focus Hours",
                    data: values,
                    borderColor: "#8b5cf6",
                    backgroundColor: "rgba(139,92,246,0.22)",
                    tension: 0.32,
                    fill: true
                }]
            },
            options: chartOptions(false)
        });

        ui.charts.tasks = new window.Chart(tasksCtx, {
            type: "doughnut",
            data: {
                labels: Object.keys(taskData),
                datasets: [{
                    data: Object.values(taskData),
                    backgroundColor: ["#22c55e", "#3b82f6", "#f59e0b", "#06b6d4", "#8b5cf6", "#f43f5e"],
                    borderWidth: 0
                }]
            },
            options: chartOptions(true)
        });

        const weeklyTotals = weeklyDomainTotals(7);
        ui.charts.domain = new window.Chart(domainCtx, {
            type: "doughnut",
            data: {
                labels: DOMAIN_ORDER,
                datasets: [{
                    data: DOMAIN_ORDER.map((domain) => Number((weeklyTotals[domain] || 0).toFixed(2))),
                    backgroundColor: DOMAIN_ORDER.map((domain) => DOMAIN_COLORS[domain]),
                    borderWidth: 0
                }]
            },
            options: chartOptions(true)
        });

        renderAnalyticsStats();
        renderWeeklyDomainHeatmap();
        renderVarianceAndBurnout();
    }

    function renderAnalyticsStats() {
        let stats = document.getElementById("analytics-stats");
        if (!stats) {
            stats = document.createElement("div");
            stats.id = "analytics-stats";
            stats.className = "stats-grid mt-6";
            document.querySelector("#analytics-view").appendChild(stats);
        }
        const totalDone = state.tasks.filter((task) => task.status === "done").length;
        const avgFocus = averageFocusHoursLast30Days();
        const streak = computeHabitStreak();
        const consistency = Math.round(last30HabitConsistency() * 100);
        stats.innerHTML = `
            ${statCard("Total Completed", `${totalDone}`, "Tasks this cycle")}
            ${statCard("Average Focus", `${avgFocus.toFixed(1)}h`, "Daily over last 30 days")}
            ${statCard("Current Streak", `${streak} days`, "Consecutive habit days")}
            ${statCard("Habit Consistency", `${consistency}%`, "Last 30 days")}
        `;
    }

    function renderWeeklyDomainHeatmap() {
        const container = document.getElementById("weekly-domain-heatmap");
        if (!container) {
            return;
        }
        const byDate = weeklyDomainByDate(7);
        const dates = Object.keys(byDate).sort();
        const maxVal = Math.max(1, ...DOMAIN_ORDER.flatMap((domain) => dates.map((date) => byDate[date][domain] || 0)));
        const header = `
            <div class="domain-heat-row text-[10px] text-dark-muted font-mono uppercase">
                <div>Domain</div>
                ${dates.map((date) => `<div class="text-center">${formatCompactDate(date)}</div>`).join("")}
            </div>
        `;
        const rows = DOMAIN_ORDER.map((domain) => {
            const color = DOMAIN_COLORS[domain];
            return `
                <div class="domain-heat-row">
                    <div class="text-xs text-dark-muted">${domain}</div>
                    ${dates.map((date) => {
                        const value = byDate[date][domain] || 0;
                        const alpha = value <= 0 ? 0.08 : 0.18 + Math.min(0.72, value / maxVal);
                        return `<div class="domain-heat-cell" style="background:${hexToRgba(color, alpha)}" title="${domain} ${date}: ${value.toFixed(1)}h">${value ? value.toFixed(1) : ""}</div>`;
                    }).join("")}
                </div>
            `;
        }).join("");
        container.innerHTML = header + rows;
    }

    function renderVarianceAndBurnout() {
        const alerts = document.getElementById("variance-alerts");
        const burnout = document.getElementById("burnout-indicator");
        if (!alerts || !burnout) {
            return;
        }
        const weekly = weeklyDomainTotals(7);
        const items = DOMAIN_ORDER.map((domain) => {
            const target = DOMAIN_TARGETS_WEEKLY[domain] || 0;
            const actual = weekly[domain] || 0;
            const diff = Number((actual - target).toFixed(1));
            const ahead = diff >= 0;
            const colorClass = Math.abs(diff) <= 1 ? "text-emerald-300" : ahead ? "text-orange-300" : "text-red-300";
            return `<div class="alert-pill"><span class="text-dark-muted">${domain}</span>: <span class="${colorClass}">${ahead ? "+" : ""}${diff}h</span> vs ${target}h target</div>`;
        });
        alerts.innerHTML = items.join("");

        const risk = burnoutRisk(weekly);
        burnout.className = `rounded-xl border px-3 py-2 text-sm ${risk.level === "high" ? "border-red-500/40 bg-red-500/10 text-red-200" : risk.level === "medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`;
        burnout.textContent = `Burnout risk: ${risk.level.toUpperCase()} - ${risk.message}`;
    }

    function statCard(title, value, sub) {
        return `
            <div class="glass-panel rounded-xl p-4">
                <div class="text-xs text-dark-muted font-mono uppercase tracking-wider">${title}</div>
                <div class="text-2xl font-bold text-white mt-2">${value}</div>
                <div class="text-xs text-dark-muted mt-1">${sub}</div>
            </div>
        `;
    }

    function chartOptions(isDoughnut) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "#cbd5e1", font: { family: "DM Sans" } }
                }
            },
            scales: isDoughnut ? {} : {
                x: {
                    grid: { color: "rgba(148,163,184,0.08)" },
                    ticks: { color: "#94a3b8", maxTicksLimit: 8 }
                },
                y: {
                    grid: { color: "rgba(148,163,184,0.08)" },
                    ticks: { color: "#94a3b8" }
                }
            }
        };
    }

    function exportAnalyticsCsv() {
        const rows = [["Date", "FocusHours", "AcademicsHours", "HealthHours", "ProjectsHours", "SleepHours", "PersonalHours", "OtherHours"]];
        const trend = focusTrend(30);
        const byDate = weeklyDomainByDate(30);
        trend.forEach((item) => {
            const d = byDate[item.isoDate] || {};
            rows.push([
                item.isoDate,
                String(item.hours),
                String(Number(d.Academics || 0).toFixed(2)),
                String(Number(d.Health || 0).toFixed(2)),
                String(Number(d.Projects || 0).toFixed(2)),
                String(Number(d.Sleep || 0).toFixed(2)),
                String(Number(d.Personal || 0).toFixed(2)),
                String(Number(d.Other || 0).toFixed(2))
            ]);
        });
        const csv = rows.map((row) => row.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lifeos-focus-${localDateISO(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function applyRunningFocusFromStorage() {
        if (state.focus.status !== "running" || !state.focus.endAt) {
            return;
        }
        tickFocusTimer();
    }

    function addActivity(icon, text) {
        state.activity.unshift(createActivity(icon, text, new Date()));
        state.activity = state.activity.slice(0, 80);
    }

    function toggleTimeBlockCompletion(blockId, date) {
        const block = state.timeBlocks.find((item) => item.id === blockId);
        if (!block) {
            return;
        }
        block.completions = block.completions || {};
        if (block.completions[date]) {
            delete block.completions[date];
            addActivity("ph-arrow-counter-clockwise", `Reopened routine block: ${block.title}`);
        } else {
            block.completions[date] = true;
            addActivity("ph-check-circle", `Completed routine block: ${block.title}`);
        }
        renderOverview();
        renderAnalytics();
        saveState();
    }

    function maybeMarkCurrentBlockComplete(domain) {
        const today = localDateISO(new Date());
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        const block = state.timeBlocks.find((item) => item.domain === domain && nowM >= toMinutes(item.start) && nowM < toMinutes(item.end));
        if (!block) {
            return;
        }
        block.completions = block.completions || {};
        block.completions[today] = true;
    }

    function requestNotificationPermission() {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().catch(() => null);
        }
    }

    function sendCompletionNotification(minutes) {
        if (!("Notification" in window)) {
            return;
        }
        if (Notification.permission === "granted") {
            new Notification("LifeOS Focus Complete", {
                body: `${minutes} minute session complete. Take a short break.`
            });
        }
    }

    function chime() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.5);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (_error) {
            // No-op if audio context is unavailable.
        }
    }

    function taskCompletionBySubject() {
        const done = state.tasks.filter((task) => task.status === "done");
        const map = {};
        SUBJECTS.forEach((subject) => {
            map[subject] = done.filter((task) => task.subject === subject).length;
        });
        return map;
    }

    function focusTrend(days) {
        const map = {};
        state.focus.sessions.forEach((session) => {
            const date = localDateISO(new Date(session.completedAt));
            map[date] = (map[date] || 0) + Number(session.durationMinutes || 0) / 60;
        });
        const points = [];
        for (let i = days - 1; i >= 0; i -= 1) {
            const date = addDaysISO(new Date(), -i);
            points.push({
                isoDate: date,
                label: formatCompactDate(date),
                hours: Number((map[date] || 0).toFixed(2))
            });
        }
        return points;
    }

    function getTodayFocusMinutes() {
        const today = localDateISO(new Date());
        return Math.round(state.focus.sessions
            .filter((session) => localDateISO(new Date(session.completedAt)) === today)
            .reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0));
    }

    function averageFocusHoursLast30Days() {
        const trend = focusTrend(30);
        const total = trend.reduce((sum, item) => sum + item.hours, 0);
        return total / 30;
    }

    function completionRateForDay(date) {
        if (!state.habits.length) {
            return 0;
        }
        const done = state.habits.filter((habit) => Boolean(habit.completions && habit.completions[date])).length;
        return done / state.habits.length;
    }

    function last30HabitConsistency() {
        let sum = 0;
        for (let i = 0; i < 30; i += 1) {
            const date = addDaysISO(new Date(), -i);
            sum += completionRateForDay(date);
        }
        return sum / 30;
    }

    function habitStreak(habit) {
        let streak = 0;
        for (let i = 0; i < 365; i += 1) {
            const date = addDaysISO(new Date(), -i);
            if (habit.completions && habit.completions[date]) {
                streak += 1;
            } else {
                break;
            }
        }
        return streak;
    }

    function computeHabitStreak() {
        let streak = 0;
        for (let i = 0; i < 365; i += 1) {
            const date = addDaysISO(new Date(), -i);
            if (completionRateForDay(date) >= 0.75) {
                streak += 1;
            } else {
                break;
            }
        }
        return streak;
    }

    function computeSubjectProgress(subject) {
        if (!subject.topics.length) {
            return 0;
        }
        const scores = { "not-started": 0, familiar: 0.4, confident: 0.75, expert: 1 };
        const total = subject.topics.reduce((sum, topic) => sum + (scores[topic.status] || 0), 0);
        return Math.round((total / subject.topics.length) * 100);
    }

    function nextExamForSubject(subject) {
        const today = localDateISO(new Date());
        const future = (subject.exams || []).filter((exam) => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date));
        return future[0] || null;
    }

    function normalizeProjectStatusValue(label) {
        const value = String(label).toLowerCase();
        if (value === "in progress" || value === "in-progress") {
            return "in-progress";
        }
        if (value === "active") {
            return "active";
        }
        if (value === "completed") {
            return "completed";
        }
        return "planning";
    }

    function normalizeProjectStatusLabel(value) {
        if (value === "in-progress") {
            return "In Progress";
        }
        if (value === "active") {
            return "Active";
        }
        if (value === "completed") {
            return "Completed";
        }
        return "Planning";
    }

    function activityTypeToDomain(type) {
        if (type === "Study") {
            return "Academics";
        }
        if (type === "Gym" || type === "Sport") {
            return "Health";
        }
        if (type === "Project Work") {
            return "Projects";
        }
        if (type === "Sleep") {
            return "Sleep";
        }
        if (type === "Meal") {
            return "Personal";
        }
        return "Other";
    }

    function weeklyDomainByDate(days) {
        const data = {};
        for (let i = days - 1; i >= 0; i -= 1) {
            const date = addDaysISO(new Date(), -i);
            data[date] = {};
            DOMAIN_ORDER.forEach((domain) => {
                data[date][domain] = 0;
            });
        }
        (state.activityLogs || []).forEach((entry) => {
            if (!data[entry.date]) {
                return;
            }
            const domain = DOMAIN_ORDER.includes(entry.domain) ? entry.domain : "Other";
            data[entry.date][domain] += Number(entry.durationMinutes || 0) / 60;
        });
        return data;
    }

    function weeklyDomainTotals(days) {
        const byDate = weeklyDomainByDate(days);
        const totals = {};
        DOMAIN_ORDER.forEach((domain) => {
            totals[domain] = 0;
        });
        Object.values(byDate).forEach((perDomain) => {
            DOMAIN_ORDER.forEach((domain) => {
                totals[domain] += Number(perDomain[domain] || 0);
            });
        });
        return totals;
    }

    function burnoutRisk(weeklyTotals) {
        const academics = weeklyTotals.Academics || 0;
        const projects = weeklyTotals.Projects || 0;
        const sleep = weeklyTotals.Sleep || 0;
        const intenseHours = academics + projects;
        if (sleep < 42 || intenseHours > 60) {
            return { level: "high", message: "Sleep is low or cognitive load is too high. Reduce project intensity and recover." };
        }
        if (sleep < 49 || intenseHours > 52) {
            return { level: "medium", message: "You are trending intense. Add recovery and protect sleep for the next 48 hours." };
        }
        return { level: "low", message: "Workload is balanced and recovery looks stable." };
    }

    function toMinutes(hhmm) {
        const [h, m] = String(hhmm).split(":").map(Number);
        return h * 60 + m;
    }

    function minutesBetween(start, end) {
        return Math.max(1, toMinutes(end) - toMinutes(start));
    }

    function durationToClock(seconds) {
        const safe = Math.max(0, Number(seconds) || 0);
        const hh = Math.floor(safe / 3600);
        const mm = Math.floor((safe % 3600) / 60);
        const ss = safe % 60;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }

    function hexToRgba(hex, alpha) {
        const clean = hex.replace("#", "");
        const n = parseInt(clean, 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function priorityColor(priority) {
        if (priority === "High") {
            return { bg: "rgba(239,68,68,0.18)", color: "#fca5a5" };
        }
        if (priority === "Medium") {
            return { bg: "rgba(249,115,22,0.18)", color: "#fdba74" };
        }
        return { bg: "rgba(16,185,129,0.18)", color: "#6ee7b7" };
    }

    function formatShortDate(dateIso) {
        return new Date(`${dateIso}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
    }

    function formatCompactDate(dateIso) {
        return new Date(`${dateIso}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
    }

    function relativeTime(timestamp) {
        const diff = Date.now() - new Date(timestamp).getTime();
        const mins = Math.round(diff / 60000);
        if (mins < 1) {
            return "just now";
        }
        if (mins < 60) {
            return `${mins}m ago`;
        }
        const hours = Math.round(mins / 60);
        if (hours < 24) {
            return `${hours}h ago`;
        }
        const days = Math.round(hours / 24);
        return `${days}d ago`;
    }

    function localDateISO(date) {
        const d = new Date(date);
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 10);
    }

    function addDaysISO(date, delta) {
        const d = new Date(date);
        d.setDate(d.getDate() + delta);
        return localDateISO(d);
    }

    function capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function fuzzyIncludes(text, query) {
        if (!query) {
            return true;
        }
        let pointer = 0;
        for (let i = 0; i < text.length && pointer < query.length; i += 1) {
            if (text[i] === query[pointer]) {
                pointer += 1;
            }
        }
        return pointer === query.length;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function uid(prefix) {
        return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
    }
})();
