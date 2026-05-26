import nextConfig from 'eslint-config-next'

export default [
    ...nextConfig,
    {
        rules: {
            // Calling async fetchers inside useEffect is standard React pattern;
            // this rule fires on all setState-calling functions invoked in effects.
            'react-hooks/set-state-in-effect': 'off',
            // Static legal-text pages use natural quotes — escaping all is impractical
            'react/no-unescaped-entities': 'off',
        },
    },
]
