// Locale detection and localization utility
// Import this anywhere: import { L, isUK, LOCALE } from '../lib/locale'

const getUserLocale = () => {
  if (typeof navigator === 'undefined') return 'en-US'
  
  const lang = navigator.language || navigator.userLanguage || 'en-US'
  
  // Check if UK/AU/NZ or other British English variants by language code
  if (/^en-(GB|AU|NZ|IE|ZA|IN)$/i.test(lang)) return 'en-GB'
  
  // Fallback: check timezone for UK/Commonwealth regions
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (/^Europe\/(London|Dublin|Belfast)|Australia|Pacific\/(Auckland|Wellington)/i.test(tz)) {
      return 'en-GB'
    }
  } catch (e) {}
  
  return 'en-US'
}

export const LOCALE = getUserLocale()
export const isUK = LOCALE === 'en-GB'

// Localized strings dictionary
// Usage: {L.Color} or L.color in template strings
export const L = {
  // Words with different UK/US spellings - lowercase
  organize: isUK ? 'organise' : 'organize',
  organized: isUK ? 'organised' : 'organized',
  organizing: isUK ? 'organising' : 'organizing',
  organization: isUK ? 'organisation' : 'organization',
  
  color: isUK ? 'colour' : 'color',
  colors: isUK ? 'colours' : 'colors',
  colored: isUK ? 'coloured' : 'colored',
  colorful: isUK ? 'colourful' : 'colorful',
  
  favorite: isUK ? 'favourite' : 'favorite',
  favorites: isUK ? 'favourites' : 'favorites',
  favorited: isUK ? 'favourited' : 'favorited',
  
  customize: isUK ? 'customise' : 'customize',
  customized: isUK ? 'customised' : 'customized',
  customizing: isUK ? 'customising' : 'customizing',
  customization: isUK ? 'customisation' : 'customization',
  
  prioritize: isUK ? 'prioritise' : 'prioritize',
  prioritized: isUK ? 'prioritised' : 'prioritized',
  prioritizing: isUK ? 'prioritising' : 'prioritizing',
  
  categorize: isUK ? 'categorise' : 'categorize',
  categorized: isUK ? 'categorised' : 'categorized',
  categorizing: isUK ? 'categorising' : 'categorizing',
  
  recognize: isUK ? 'recognise' : 'recognize',
  recognized: isUK ? 'recognised' : 'recognized',
  recognizing: isUK ? 'recognising' : 'recognizing',
  
  visualize: isUK ? 'visualise' : 'visualize',
  visualized: isUK ? 'visualised' : 'visualized',
  visualizing: isUK ? 'visualising' : 'visualizing',
  
  analyze: isUK ? 'analyse' : 'analyze',
  analyzed: isUK ? 'analysed' : 'analyzed',
  analyzing: isUK ? 'analysing' : 'analyzing',
  analysis: isUK ? 'analysis' : 'analysis', // same spelling
  
  center: isUK ? 'centre' : 'center',
  centered: isUK ? 'centred' : 'centered',
  centering: isUK ? 'centring' : 'centering',
  
  canceled: isUK ? 'cancelled' : 'canceled',
  canceling: isUK ? 'cancelling' : 'canceling',
  
  labeled: isUK ? 'labelled' : 'labeled',
  labeling: isUK ? 'labelling' : 'labeling',
  
  traveled: isUK ? 'travelled' : 'traveled',
  traveling: isUK ? 'travelling' : 'traveling',
  
  modeling: isUK ? 'modelling' : 'modeling',
  modeled: isUK ? 'modelled' : 'modeled',
  
  honor: isUK ? 'honour' : 'honor',
  honored: isUK ? 'honoured' : 'honored',
  
  favor: isUK ? 'favour' : 'favor',
  favored: isUK ? 'favoured' : 'favored',
  
  behavior: isUK ? 'behaviour' : 'behavior',
  behaviors: isUK ? 'behaviours' : 'behaviors',
  
  neighbor: isUK ? 'neighbour' : 'neighbor',
  neighbors: isUK ? 'neighbours' : 'neighbors',
  
  apologize: isUK ? 'apologise' : 'apologize',
  apologized: isUK ? 'apologised' : 'apologized',
  
  synchronize: isUK ? 'synchronise' : 'synchronize',
  synchronized: isUK ? 'synchronised' : 'synchronized',
  
  optimize: isUK ? 'optimise' : 'optimize',
  optimized: isUK ? 'optimised' : 'optimized',
  optimizing: isUK ? 'optimising' : 'optimizing',
  
  // Capitalized versions - for sentence starts
  Organize: isUK ? 'Organise' : 'Organize',
  Organized: isUK ? 'Organised' : 'Organized',
  Organizing: isUK ? 'Organising' : 'Organizing',
  Organization: isUK ? 'Organisation' : 'Organization',
  
  Color: isUK ? 'Colour' : 'Color',
  Colors: isUK ? 'Colours' : 'Colors',
  Colored: isUK ? 'Coloured' : 'Colored',
  Colorful: isUK ? 'Colourful' : 'Colorful',
  
  Favorite: isUK ? 'Favourite' : 'Favorite',
  Favorites: isUK ? 'Favourites' : 'Favorites',
  
  Customize: isUK ? 'Customise' : 'Customize',
  Customized: isUK ? 'Customised' : 'Customized',
  Customization: isUK ? 'Customisation' : 'Customization',
  
  Prioritize: isUK ? 'Prioritise' : 'Prioritize',
  Prioritized: isUK ? 'Prioritised' : 'Prioritized',
  
  Categorize: isUK ? 'Categorise' : 'Categorize',
  Categorized: isUK ? 'Categorised' : 'Categorized',
  
  Recognize: isUK ? 'Recognise' : 'Recognize',
  Recognized: isUK ? 'Recognised' : 'Recognized',
  
  Visualize: isUK ? 'Visualise' : 'Visualize',
  Visualized: isUK ? 'Visualised' : 'Visualized',
  
  Analyze: isUK ? 'Analyse' : 'Analyze',
  Analyzed: isUK ? 'Analysed' : 'Analyzed',
  
  Center: isUK ? 'Centre' : 'Center',
  Centered: isUK ? 'Centred' : 'Centered',
  
  Canceled: isUK ? 'Cancelled' : 'Canceled',
  Canceling: isUK ? 'Cancelling' : 'Canceling',
  
  Labeled: isUK ? 'Labelled' : 'Labeled',
  
  Honor: isUK ? 'Honour' : 'Honor',
  Honored: isUK ? 'Honoured' : 'Honored',
  
  Favor: isUK ? 'Favour' : 'Favor',
  Favored: isUK ? 'Favoured' : 'Favored',
  
  Behavior: isUK ? 'Behaviour' : 'Behavior',
  Behaviors: isUK ? 'Behaviours' : 'Behaviors',
  
  Neighbor: isUK ? 'Neighbour' : 'Neighbor',
  Neighbors: isUK ? 'Neighbours' : 'Neighbors',
  
  Apologize: isUK ? 'Apologise' : 'Apologize',
  
  Synchronize: isUK ? 'Synchronise' : 'Synchronize',
  Synchronized: isUK ? 'Synchronised' : 'Synchronized',
  
  Optimize: isUK ? 'Optimise' : 'Optimize',
  Optimized: isUK ? 'Optimised' : 'Optimized',
}

export default L
