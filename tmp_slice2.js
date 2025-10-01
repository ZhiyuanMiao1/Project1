  courseFocus: '',
  format: '线上授课',
  milestone: '',
  availability: DEFAULT_TIME_ZONE,
  contactName: '',
  contactMethod: '微信',
  contactValue: '',
};

const PAGE_TRANSITION_DURATION = 600;

function StudentCourseRequestPage() {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDirectionSelection, setIsDirectionSelection] = useState(false);
  const [transitionStage, setTransitionStage] = useState('idle');
  const pendingActionRef = useRef(null);
  const isMountedRef = useRef(true);

  // ----- Schedule step local states -----
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [is24h, setIs24h] = useState(true);

  useEffect(() => () => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;   // 卸载时再关掉
    };
  }, []);

  useEffect(() => {
    if (transitionStage === 'exiting') {
      const timeout = setTimeout(() => {
        const action = pendingActionRef.current;
        if (action) {
          action();
        }
        pendingActionRef.current = null;
        if (!isMountedRef.current) {
          return;
        }
        setTransitionStage('entering');
      }, PAGE_TRANSITION_DURATION);
      return () => clearTimeout(timeout);
    }

    if (transitionStage === 'entering') {
      const timeout = setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }
        setTransitionStage('idle');
      }, PAGE_TRANSITION_DURATION);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [transitionStage]);

  const currentStep = useMemo(() => STEPS[currentStepIndex], [currentStepIndex]);
  // Ordered options based on current selection
  const orderedTimeZoneOptions = useMemo(() => {
    const referenceDate = new Date();
    // Build fresh labels for consistency with any future date logic
    const base = buildTimeZoneOptions(referenceDate);
    return orderTimeZoneOptionsAroundSelected(base, formData.availability, referenceDate);
  }, [formData.availability]);

  // Custom Select: Time zone dropdown that centers current option
  const TimeZoneSelect = ({ id, value, onChange, options }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
      if (!open) return;
      const listEl = listRef.current;
      if (!listEl) return;
      const idx = options.findIndex((o) => o.value === value);
      if (idx === -1) return;
      const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
      if (!itemEl) return;
      // Scroll so that selected item is approximately centered
      const listHeight = listEl.clientHeight;
      const itemTop = itemEl.offsetTop;
      const itemHeight = itemEl.offsetHeight;
      const targetScroll = itemTop - Math.max(0, (listHeight - itemHeight) / 2);
      try {
        listEl.scrollTo({ top: targetScroll, behavior: 'auto' });
      } catch (_) {
        listEl.scrollTop = targetScroll;
      }
    }, [open, options, value]);

    useEffect(() => {
      const onDocClick = (e) => {
        if (!open) return;
        const btn = buttonRef.current;
