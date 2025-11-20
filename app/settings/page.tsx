'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Input } from '@/src/components/ui/input'
import { Button } from '@/src/components/ui/button'
import { useToast } from '@/src/hooks/use-toast'
import axios from 'axios'
import { Loader2, Eye, EyeOff } from 'lucide-react'

export default function SettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    geminiApiKey: '',
    openAlexApiKey: '',
    crossrefApiKey: '',
    pdfServiceUrl: 'http://localhost:8000',
    sendGridApiKey: '',
    slackWebhookUrl: '',
    discordWebhookUrl: '',
    bingVisualSearchApiKey: '',
    bingVisualSearchEndpoint: '',
  })
  const [originalSettings, setOriginalSettings] = useState({
    geminiApiKey: '',
    openAlexApiKey: '',
    crossrefApiKey: '',
    pdfServiceUrl: 'http://localhost:8000',
    sendGridApiKey: '',
    slackWebhookUrl: '',
    discordWebhookUrl: '',
    bingVisualSearchApiKey: '',
    bingVisualSearchEndpoint: '',
  })
  const [actualKeys, setActualKeys] = useState({
    geminiApiKey: '',
    openAlexApiKey: '',
    crossrefApiKey: '',
    sendGridApiKey: '',
    bingVisualSearchApiKey: '',
  })
  const [originalKeys, setOriginalKeys] = useState({
    geminiApiKey: '',
    openAlexApiKey: '',
    crossrefApiKey: '',
    sendGridApiKey: '',
    bingVisualSearchApiKey: '',
  })
  const [visibleFields, setVisibleFields] = useState({
    geminiApiKey: false,
    openAlexApiKey: false,
    crossrefApiKey: false,
    pdfServiceUrl: false,
    sendGridApiKey: false,
    slackWebhookUrl: false,
    discordWebhookUrl: false,
    bingVisualSearchApiKey: false,
    bingVisualSearchEndpoint: false,
  })

  useEffect(() => {
    loadSettings()
  }, [])

  // Check if there are any changes
  const hasChanges = () => {
    // Check PDF Service URL
    if (settings.pdfServiceUrl !== originalSettings.pdfServiceUrl) {
      return true
    }

    // Check alert configuration fields
    // For SendGrid API key, check actual value
    const currentSendGrid = visibleFields.sendGridApiKey 
      ? actualKeys.sendGridApiKey 
      : (settings.sendGridApiKey && !settings.sendGridApiKey.startsWith('••••') ? settings.sendGridApiKey : originalKeys.sendGridApiKey)
    if (currentSendGrid !== (originalKeys.sendGridApiKey || '')) return true
    
    if (settings.slackWebhookUrl !== originalSettings.slackWebhookUrl) return true
    if (settings.discordWebhookUrl !== originalSettings.discordWebhookUrl) return true
    
    // Check Bing Visual Search fields
    const currentBingKey = visibleFields.bingVisualSearchApiKey 
      ? actualKeys.bingVisualSearchApiKey 
      : (settings.bingVisualSearchApiKey && !settings.bingVisualSearchApiKey.startsWith('••••') ? settings.bingVisualSearchApiKey : originalKeys.bingVisualSearchApiKey)
    if (currentBingKey !== (originalKeys.bingVisualSearchApiKey || '')) return true
    if (settings.bingVisualSearchEndpoint !== originalSettings.bingVisualSearchEndpoint) return true

    // Check API keys - compare actual values
    // Get current value: if visible, use actualKeys; if not visible but not masked, use settings; otherwise use original
    const getCurrentValue = (field: 'geminiApiKey' | 'openAlexApiKey' | 'crossrefApiKey') => {
      if (visibleFields[field]) {
        return actualKeys[field] || ''
      }
      const settingValue = settings[field]
      if (settingValue && !settingValue.startsWith('••••')) {
        // User is typing a new value
        return settingValue
      }
      // Use original key if available, otherwise empty
      return originalKeys[field] || ''
    }

    const currentGemini = getCurrentValue('geminiApiKey')
    const currentOpenAlex = getCurrentValue('openAlexApiKey')
    const currentCrossref = getCurrentValue('crossrefApiKey')

    const originalGemini = originalKeys.geminiApiKey || ''
    const originalOpenAlex = originalKeys.openAlexApiKey || ''
    const originalCrossref = originalKeys.crossrefApiKey || ''

    if (currentGemini !== originalGemini) return true
    if (currentOpenAlex !== originalOpenAlex) return true
    if (currentCrossref !== originalCrossref) return true

    return false
  }

  const loadSettings = async () => {
    try {
      const response = await axios.get('/api/settings')
      const data = response.data.settings
      
      // Store actual keys separately (we'll fetch them if needed)
      const hasKeys = {
        geminiApiKey: data.hasGeminiApiKey,
        openAlexApiKey: data.hasOpenAlexApiKey,
        crossrefApiKey: data.hasCrossrefApiKey,
      }
      
      const initialSettings = {
        geminiApiKey: hasKeys.geminiApiKey ? '••••••••••••••••' : '',
        openAlexApiKey: hasKeys.openAlexApiKey ? '••••••••••••••••' : '',
        crossrefApiKey: hasKeys.crossrefApiKey ? '••••••••••••••••' : '',
        pdfServiceUrl: data.pdfServiceUrl || 'http://localhost:8000',
        sendGridApiKey: data.hasSendGridApiKey ? '••••••••••••••••' : '',
        slackWebhookUrl: data.slackWebhookUrl || '',
        discordWebhookUrl: data.discordWebhookUrl || '',
        bingVisualSearchApiKey: data.hasBingVisualSearchApiKey ? '••••••••••••••••' : '',
        bingVisualSearchEndpoint: data.bingVisualSearchEndpoint || '',
      }
      
      setSettings(initialSettings)
      setOriginalSettings(initialSettings)
      
      // Initialize actual keys as empty (will be fetched when user clicks view)
      setActualKeys({
        geminiApiKey: '',
        openAlexApiKey: '',
        crossrefApiKey: '',
        sendGridApiKey: '',
        bingVisualSearchApiKey: '',
      })
      setOriginalKeys({
        geminiApiKey: '',
        openAlexApiKey: '',
        crossrefApiKey: '',
        sendGridApiKey: '',
        bingVisualSearchApiKey: '',
      })
    } catch (error) {
      console.error('Error loading settings:', error)
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleVisibility = async (field: 'geminiApiKey' | 'openAlexApiKey' | 'crossrefApiKey' | 'pdfServiceUrl' | 'sendGridApiKey' | 'slackWebhookUrl' | 'discordWebhookUrl' | 'bingVisualSearchApiKey' | 'bingVisualSearchEndpoint') => {
    // For non-API-key fields, just toggle visibility (no API call needed)
    if (field === 'pdfServiceUrl' || field === 'slackWebhookUrl' || field === 'discordWebhookUrl' || field === 'bingVisualSearchEndpoint') {
      setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }))
      return
    }
    
    // For SendGrid API key, handle similar to other API keys
    if (field === 'sendGridApiKey') {
      const fieldKey = field as keyof typeof actualKeys
      
      // If showing (currently hidden), fetch the actual value
      if (!visibleFields[field]) {
        // If we don't have the actual key yet, fetch it
        if (!actualKeys[fieldKey]) {
          try {
            const response = await axios.get('/api/settings/sendgrid-api-key')
            if (response.data.apiKey) {
              const fetchedKey = response.data.apiKey
              setActualKeys(prev => ({ ...prev, [fieldKey]: fetchedKey }))
              setOriginalKeys(prev => {
                if (!prev[fieldKey]) {
                  return { ...prev, [fieldKey]: fetchedKey }
                }
                return prev
              })
              setSettings(prev => ({ ...prev, [field]: fetchedKey }))
            }
          } catch (error: any) {
            console.error(`Error fetching ${field}:`, error)
            if (error.response?.status !== 404) {
              toast({
                title: 'Error',
                description: `Failed to fetch ${field}`,
                variant: 'destructive',
              })
            }
            return
          }
        } else {
          setSettings(prev => ({ 
            ...prev, 
            [field]: actualKeys[fieldKey] || '' 
          }))
        }
      } else {
        // Hiding: show masked value
        const hasKey = actualKeys[fieldKey] !== ''
        setSettings(prev => ({ 
          ...prev, 
          [field]: hasKey ? '••••••••••••••••' : '' 
        }))
      }
      
      setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }))
      return
    }
    
    // For Bing Visual Search API key, handle similar to other API keys
    if (field === 'bingVisualSearchApiKey') {
      const fieldKey = field as keyof typeof actualKeys
      
      // If showing (currently hidden), fetch the actual value
      if (!visibleFields[field]) {
        // If we don't have the actual key yet, fetch it
        if (!actualKeys[fieldKey]) {
          try {
            const response = await axios.get('/api/settings/bing-visual-search-api-key')
            if (response.data.apiKey) {
              const fetchedKey = response.data.apiKey
              setActualKeys(prev => ({ ...prev, [fieldKey]: fetchedKey }))
              setOriginalKeys(prev => {
                if (!prev[fieldKey]) {
                  return { ...prev, [fieldKey]: fetchedKey }
                }
                return prev
              })
              setSettings(prev => ({ ...prev, [field]: fetchedKey }))
            }
          } catch (error: any) {
            console.error(`Error fetching ${field}:`, error)
            if (error.response?.status !== 404) {
              toast({
                title: 'Error',
                description: `Failed to fetch ${field}`,
                variant: 'destructive',
              })
            }
            return
          }
        } else {
          setSettings(prev => ({ 
            ...prev, 
            [field]: actualKeys[fieldKey] || '' 
          }))
        }
      } else {
        // Hiding: show masked value
        const hasKey = actualKeys[fieldKey] !== ''
        setSettings(prev => ({ 
          ...prev, 
          [field]: hasKey ? '••••••••••••••••' : '' 
        }))
      }
      
      setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }))
      return
    }

    const fieldKey = field as keyof typeof actualKeys

    // If showing (currently hidden), fetch the actual value
    if (!visibleFields[field]) {
      // If we don't have the actual key yet, fetch it
      if (!actualKeys[fieldKey]) {
        try {
          // Map field names to API routes
          const routeMap: Record<string, string> = {
            geminiApiKey: '/api/settings/gemini-key',
            openAlexApiKey: '/api/settings/openalex-api-key',
            crossrefApiKey: '/api/settings/crossref-api-key',
          }
          
          const route = routeMap[field]
          if (route) {
            const response = await axios.get(route)
            if (response.data.apiKey) {
              const fetchedKey = response.data.apiKey
              setActualKeys(prev => ({ ...prev, [fieldKey]: fetchedKey }))
              // Set original key when first fetched (so we can detect changes)
              setOriginalKeys(prev => {
                if (!prev[fieldKey]) {
                  return { ...prev, [fieldKey]: fetchedKey }
                }
                return prev
              })
              setSettings(prev => ({ ...prev, [field]: fetchedKey }))
            }
          }
        } catch (error: any) {
          console.error(`Error fetching ${field}:`, error)
          // If key doesn't exist (404), that's okay - just show empty
          if (error.response?.status !== 404) {
            toast({
              title: 'Error',
              description: `Failed to fetch ${field}`,
              variant: 'destructive',
            })
          }
          return
        }
      } else {
        // We already have the key, just show it
        setSettings(prev => ({ 
          ...prev, 
          [field]: actualKeys[fieldKey] || '' 
        }))
      }
    } else {
      // Hiding: show masked value
      const hasKey = actualKeys[fieldKey] !== ''
      setSettings(prev => ({ 
        ...prev, 
        [field]: hasKey ? '••••••••••••••••' : '' 
      }))
    }
    
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Only send non-empty values (don't send placeholder values)
      const payload: any = {}
      
      // For API keys, use actualKeys if available, otherwise use settings (if not masked)
      // Priority: actualKeys > settings (if not masked) > null
      const geminiValue = actualKeys.geminiApiKey 
        ? actualKeys.geminiApiKey 
        : (settings.geminiApiKey && !settings.geminiApiKey.startsWith('••••') ? settings.geminiApiKey : null)
      
      const openAlexValue = actualKeys.openAlexApiKey 
        ? actualKeys.openAlexApiKey 
        : (settings.openAlexApiKey && !settings.openAlexApiKey.startsWith('••••') ? settings.openAlexApiKey : null)
      
      const crossrefValue = actualKeys.crossrefApiKey 
        ? actualKeys.crossrefApiKey 
        : (settings.crossrefApiKey && !settings.crossrefApiKey.startsWith('••••') ? settings.crossrefApiKey : null)
      
      // Always include API keys in payload if they have a value (including empty string to clear)
      if (geminiValue !== null && geminiValue !== undefined) {
        payload.geminiApiKey = geminiValue
      }
      if (openAlexValue !== null && openAlexValue !== undefined) {
        payload.openAlexApiKey = openAlexValue
      }
      if (crossrefValue !== null && crossrefValue !== undefined) {
        payload.crossrefApiKey = crossrefValue
      }
      if (settings.pdfServiceUrl) {
        payload.pdfServiceUrl = settings.pdfServiceUrl
      }
      
      // Alert configuration fields
      const sendGridValue = actualKeys.sendGridApiKey 
        ? actualKeys.sendGridApiKey 
        : (settings.sendGridApiKey && !settings.sendGridApiKey.startsWith('••••') ? settings.sendGridApiKey : null)
      
      if (sendGridValue !== null && sendGridValue !== undefined) {
        payload.sendGridApiKey = sendGridValue
      }
      if (settings.slackWebhookUrl) {
        payload.slackWebhookUrl = settings.slackWebhookUrl
      }
      if (settings.discordWebhookUrl) {
        payload.discordWebhookUrl = settings.discordWebhookUrl
      }
      
      // Bing Visual Search fields
      const bingKeyValue = actualKeys.bingVisualSearchApiKey 
        ? actualKeys.bingVisualSearchApiKey 
        : (settings.bingVisualSearchApiKey && !settings.bingVisualSearchApiKey.startsWith('••••') ? settings.bingVisualSearchApiKey : null)
      
      if (bingKeyValue !== null && bingKeyValue !== undefined) {
        payload.bingVisualSearchApiKey = bingKeyValue
      }
      if (settings.bingVisualSearchEndpoint) {
        payload.bingVisualSearchEndpoint = settings.bingVisualSearchEndpoint
      }

      await axios.post('/api/settings', payload)
      
      toast({
        title: 'Success',
        description: 'Settings saved successfully',
      })
      
      // Update original values to match current values
      const newOriginalKeys = {
        geminiApiKey: visibleFields.geminiApiKey ? actualKeys.geminiApiKey : (geminiValue || originalKeys.geminiApiKey),
        openAlexApiKey: visibleFields.openAlexApiKey ? actualKeys.openAlexApiKey : (openAlexValue || originalKeys.openAlexApiKey),
        crossrefApiKey: visibleFields.crossrefApiKey ? actualKeys.crossrefApiKey : (crossrefValue || originalKeys.crossrefApiKey),
        sendGridApiKey: visibleFields.sendGridApiKey ? actualKeys.sendGridApiKey : (sendGridValue || originalKeys.sendGridApiKey),
        bingVisualSearchApiKey: visibleFields.bingVisualSearchApiKey ? actualKeys.bingVisualSearchApiKey : (bingKeyValue || originalKeys.bingVisualSearchApiKey),
      }
      
      setOriginalKeys(newOriginalKeys)
      setOriginalSettings({
        ...settings,
        pdfServiceUrl: settings.pdfServiceUrl,
        sendGridApiKey: visibleFields.sendGridApiKey ? actualKeys.sendGridApiKey : (sendGridValue || originalSettings.sendGridApiKey),
        slackWebhookUrl: settings.slackWebhookUrl,
        discordWebhookUrl: settings.discordWebhookUrl,
        bingVisualSearchApiKey: visibleFields.bingVisualSearchApiKey ? actualKeys.bingVisualSearchApiKey : (bingKeyValue || originalSettings.bingVisualSearchApiKey),
        bingVisualSearchEndpoint: settings.bingVisualSearchEndpoint,
      })
      
      // Reload settings to show updated state
      await loadSettings()
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save settings',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure Scholar Sentinel</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>Configure external API keys and endpoints</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Gemini API Key (Required for AI extraction)</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.geminiApiKey ? "text" : "password"}
                placeholder="Enter Gemini API key"
                value={settings.geminiApiKey}
                onChange={(e) => {
                  const newValue = e.target.value
                  setSettings({ ...settings, geminiApiKey: newValue })
                  if (visibleFields.geminiApiKey) {
                    setActualKeys(prev => ({ ...prev, geminiApiKey: newValue }))
                  } else if (!newValue.startsWith('••••')) {
                    // User is typing a new value (not masked)
                    setActualKeys(prev => ({ ...prev, geminiApiKey: newValue }))
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('geminiApiKey')}
                title={visibleFields.geminiApiKey ? "Hide" : "View"}
              >
                {visibleFields.geminiApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Required for AI-powered reference and metadata extraction
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">PDF Service URL</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.pdfServiceUrl ? "text" : "text"}
                placeholder="http://localhost:8000"
                value={settings.pdfServiceUrl}
                onChange={(e) => setSettings({ ...settings, pdfServiceUrl: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('pdfServiceUrl')}
                title={visibleFields.pdfServiceUrl ? "Hide" : "View"}
              >
                {visibleFields.pdfServiceUrl ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">OpenAlex API Key (Optional)</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.openAlexApiKey ? "text" : "password"}
                placeholder="Enter API key"
                value={settings.openAlexApiKey}
                onChange={(e) => {
                  const newValue = e.target.value
                  setSettings({ ...settings, openAlexApiKey: newValue })
                  if (visibleFields.openAlexApiKey) {
                    setActualKeys(prev => ({ ...prev, openAlexApiKey: newValue }))
                  } else if (!newValue.startsWith('••••')) {
                    // User is typing a new value (not masked)
                    setActualKeys(prev => ({ ...prev, openAlexApiKey: newValue }))
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('openAlexApiKey')}
                title={visibleFields.openAlexApiKey ? "Hide" : "View"}
              >
                {visibleFields.openAlexApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">CrossRef API Key (Optional)</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.crossrefApiKey ? "text" : "password"}
                placeholder="Enter API key"
                value={settings.crossrefApiKey}
                onChange={(e) => {
                  const newValue = e.target.value
                  setSettings({ ...settings, crossrefApiKey: newValue })
                  if (visibleFields.crossrefApiKey) {
                    setActualKeys(prev => ({ ...prev, crossrefApiKey: newValue }))
                  } else if (!newValue.startsWith('••••')) {
                    // User is typing a new value (not masked)
                    setActualKeys(prev => ({ ...prev, crossrefApiKey: newValue }))
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('crossrefApiKey')}
                title={visibleFields.crossrefApiKey ? "Hide" : "View"}
              >
                {visibleFields.crossrefApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Bing Visual Search API Key (Optional)</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.bingVisualSearchApiKey ? "text" : "password"}
                placeholder="Enter Azure Computer Vision API key"
                value={settings.bingVisualSearchApiKey}
                onChange={(e) => {
                  const newValue = e.target.value
                  setSettings({ ...settings, bingVisualSearchApiKey: newValue })
                  if (visibleFields.bingVisualSearchApiKey) {
                    setActualKeys(prev => ({ ...prev, bingVisualSearchApiKey: newValue }))
                  } else if (!newValue.startsWith('••••')) {
                    setActualKeys(prev => ({ ...prev, bingVisualSearchApiKey: newValue }))
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('bingVisualSearchApiKey')}
                title={visibleFields.bingVisualSearchApiKey ? "Hide" : "View"}
              >
                {visibleFields.bingVisualSearchApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Required for reverse image search to detect copied diagrams
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Bing Visual Search Endpoint</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.bingVisualSearchEndpoint ? "text" : "text"}
                placeholder="https://your-resource.cognitiveservices.azure.com"
                value={settings.bingVisualSearchEndpoint}
                onChange={(e) => setSettings({ ...settings, bingVisualSearchEndpoint: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('bingVisualSearchEndpoint')}
                title={visibleFields.bingVisualSearchEndpoint ? "Hide" : "View"}
              >
                {visibleFields.bingVisualSearchEndpoint ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Azure Computer Vision endpoint URL (e.g., https://your-resource.cognitiveservices.azure.com)
            </p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={saving || !hasChanges()}
            className={hasChanges() ? '' : 'opacity-50 cursor-not-allowed'}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert Configuration</CardTitle>
          <CardDescription>Configure alert delivery channels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Email (SendGrid API Key)</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.sendGridApiKey ? "text" : "password"}
                placeholder="Enter SendGrid API key"
                value={settings.sendGridApiKey}
                onChange={(e) => {
                  const newValue = e.target.value
                  setSettings({ ...settings, sendGridApiKey: newValue })
                  if (visibleFields.sendGridApiKey) {
                    setActualKeys(prev => ({ ...prev, sendGridApiKey: newValue }))
                  } else if (!newValue.startsWith('••••')) {
                    setActualKeys(prev => ({ ...prev, sendGridApiKey: newValue }))
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('sendGridApiKey')}
                title={visibleFields.sendGridApiKey ? "Hide" : "View"}
              >
                {visibleFields.sendGridApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Slack Webhook URL</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.slackWebhookUrl ? "text" : "text"}
                placeholder="https://hooks.slack.com/services/..."
                value={settings.slackWebhookUrl}
                onChange={(e) => setSettings({ ...settings, slackWebhookUrl: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('slackWebhookUrl')}
                title={visibleFields.slackWebhookUrl ? "Hide" : "View"}
              >
                {visibleFields.slackWebhookUrl ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Discord Webhook URL</label>
            <div className="flex gap-2">
              <Input
                type={visibleFields.discordWebhookUrl ? "text" : "text"}
                placeholder="https://discord.com/api/webhooks/..."
                value={settings.discordWebhookUrl}
                onChange={(e) => setSettings({ ...settings, discordWebhookUrl: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleVisibility('discordWebhookUrl')}
                title={visibleFields.discordWebhookUrl ? "Hide" : "View"}
              >
                {visibleFields.discordWebhookUrl ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

