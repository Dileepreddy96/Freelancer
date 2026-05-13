/**
 * Freelance Bidding System - Currency Converter
 * 
 * This script detects a user's country/currency via IP, fetches the current exchange rate,
 * and formats the base USD bid amount into the user's local currency using the Intl API.
 */

class CurrencyManager {
    constructor() {
        this.baseCurrency = 'USD';
        this.userCurrency = 'USD'; // Default to USD
        this.userLocale = 'en-US'; // Default locale
        this.exchangeRates = {};
    }

    /**
     * Initializes the currency manager by detecting the user's location
     * and fetching the latest exchange rates.
     */
    async init() {
        try {
            await Promise.all([
                this.detectUserLocation(),
                this.fetchExchangeRates()
            ]);
            console.log(`Initialization complete. User Currency: ${this.userCurrency}, Locale: ${this.userLocale}`);
        } catch (error) {
            console.error('Failed to initialize currency manager:', error);
        }
    }

    /**
     * Detects the user's country and currency based on their IP address.
     * Uses a free IP geolocation API (ipapi.co as an example).
     */
    async detectUserLocation() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            
            if (data.currency) {
                this.userCurrency = data.currency;
            }
            if (data.languages) {
                // Get the primary language locale (e.g., 'en-US' or 'hi-IN' from 'hi-IN,en-GB;q=0.9')
                this.userLocale = data.languages.split(',')[0];
            } else if (data.country_code) {
                // Fallback to standard language-country format
                this.userLocale = `en-${data.country_code}`;
            }
        } catch (error) {
            console.warn('Could not detect user location, defaulting to USD/en-US.', error);
        }
    }

    /**
     * Fetches current exchange rates with USD as the base currency.
     * Uses a free exchange rate API (open.er-api.com as an example).
     */
    async fetchExchangeRates() {
        try {
            const response = await fetch(`https://open.er-api.com/v6/latest/${this.baseCurrency}`);
            const data = await response.json();
            
            if (data && data.rates) {
                this.exchangeRates = data.rates;
            }
        } catch (error) {
            console.error('Could not fetch exchange rates.', error);
        }
    }

    /**
     * Converts a base amount (in USD) to the user's local currency.
     * @param {number} baseAmount - The amount in USD
     * @returns {number} The converted amount
     */
    convertAmount(baseAmount) {
        if (this.userCurrency === this.baseCurrency) {
            return baseAmount;
        }
        
        const rate = this.exchangeRates[this.userCurrency];
        if (!rate) {
            console.warn(`Exchange rate for ${this.userCurrency} not found. Returning base amount.`);
            return baseAmount;
        }

        return baseAmount * rate;
    }

    /**
     * Formats a numeric price into a localized currency string using Intl.NumberFormat.
     * @param {number} amount - The numeric amount to format
     * @param {string} currency - The currency code (e.g., 'USD', 'INR')
     * @param {string} locale - The user's locale (e.g., 'en-US', 'en-IN')
     * @returns {string} The formatted currency string
     */
    formatPrice(amount, currency = this.userCurrency, locale = this.userLocale) {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Convenience method to convert and format a base USD bid in one step.
     * @param {number} baseAmount - The bid amount in USD
     * @returns {string} The formatted local price string
     */
    getDisplayPrice(baseAmount) {
        const localAmount = this.convertAmount(baseAmount);
        return this.formatPrice(localAmount);
    }
}

// ==========================================
// Example Usage
// ==========================================

async function runBiddingExample() {
    const currencyManager = new CurrencyManager();
    
    // Simulate setting up the app environment
    await currencyManager.init();

    // 1. Storing the bid
    // Always store the raw base amount (USD) in your database!
    const baseBidAmountUSD = 500.00; 
    console.log(`Stored Database Value: ${baseBidAmountUSD} USD`);

    // 2. Displaying the bid to the current user
    const displayString = currencyManager.getDisplayPrice(baseBidAmountUSD);
    console.log(`Display to user (${currencyManager.userCurrency}): ${displayString}`);
    
    // 3. Simulating how it looks for different users
    console.log("\n--- Simulating other locales ---");
    
    // Simulating an Indian User
    const inrRate = currencyManager.exchangeRates['INR'] || 83.5; // Fallback rate if API failed
    const inrAmount = baseBidAmountUSD * inrRate;
    console.log('Indian User sees:', currencyManager.formatPrice(inrAmount, 'INR', 'en-IN'));
    
    // Simulating a European User
    const eurRate = currencyManager.exchangeRates['EUR'] || 0.92;
    const eurAmount = baseBidAmountUSD * eurRate;
    console.log('European User sees:', currencyManager.formatPrice(eurAmount, 'EUR', 'de-DE'));
}

// Uncomment the line below to run the example
// runBiddingExample();
