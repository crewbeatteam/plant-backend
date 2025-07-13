import type { ImageIdentifier, ImageIdentificationRequest, ImageIdentificationResult } from "./interface";
import OpenAI from 'openai';

export class OpenAIIdentifier implements ImageIdentifier {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  getName(): string {
    return "OpenAI GPT-4 Vision";
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test API availability by listing models
      await this.openai.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async identify(request: ImageIdentificationRequest): Promise<ImageIdentificationResult> {
    const startTime = Date.now();

    try {
      // Prepare images for OpenAI Vision API
      const imageMessages = request.images.map(image => ({
        type: "image_url" as const,
        image_url: {
          url: this.formatImageForOpenAI(image),
          detail: "high" as const
        }
      }));

      // Create prompt based on request parameters
      const prompt = this.createIdentificationPrompt(request);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o", // GPT-4 with vision capabilities
        messages: [
          {
            role: "system",
            content: "You are a professional botanist and plant identification expert. Analyze the provided plant images and return detailed identification results in JSON format."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...imageMessages
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1 // Low temperature for more consistent results
      });

      const analysisText = completion.choices[0]?.message?.content || '';

      // Parse the JSON response from OpenAI
      return this.parseOpenAIResponse(analysisText, Date.now() - startTime);

    } catch (error) {
      console.error('OpenAI identification error:', error);
      
      // Return fallback response
      return {
        is_plant: {
          probability: 0.5,
          threshold: 0.5,
          binary: false
        },
        classification: {
          suggestions: []
        },
        processing_time_ms: Date.now() - startTime,
        provider: this.getName()
      };
    }
  }

  private formatImageForOpenAI(image: string): string {
    // OpenAI expects data URL format
    if (image.startsWith('data:')) {
      return image;
    } else if (image.startsWith('http')) {
      return image; // URL
    } else {
      // Assume base64, add data URL prefix
      return `data:image/jpeg;base64,${image}`;
    }
  }

  private createIdentificationPrompt(request: ImageIdentificationRequest): string {
    let prompt = `Analyze the plant(s) in the provided image(s) and identify the species. 

Please respond with a JSON object in this exact format:
{
  "is_plant": {
    "probability": 0.95,
    "confidence_explanation": "Clear plant features visible"
  },
  "suggestions": [
    {
      "scientific_name": "Ficus lyrata",
      "common_names": ["Fiddle Leaf Fig", "Fiddle-leaf Fig Tree"],
      "confidence": 0.92,
      "reasoning": "Distinctive large, violin-shaped leaves with prominent veining",
      "taxonomy": {
        "kingdom": "Plantae",
        "family": "Moraceae", 
        "genus": "Ficus",
        "species": "lyrata"
      },
      "care_notes": "Bright indirect light, water when soil is dry"
    }
  ]
}

Guidelines:
- Provide 1-3 most likely species identifications
- Include confidence scores (0-1) based on visible features
- Focus on ${request.classification_level || 'species'} level identification
- Consider geographic location if provided: ${request.latitude ? `lat: ${request.latitude}, lng: ${request.longitude}` : 'not provided'}
- Use language: ${request.language || 'en'}
- If not a plant, set is_plant.probability low and explain why

Analyze the image(s) now:`;

    return prompt;
  }

  private parseOpenAIResponse(responseText: string, processingTime: number): ImageIdentificationResult {
    try {
      // Extract JSON from response (OpenAI sometimes adds extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in OpenAI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Transform OpenAI response to our standard format
      const suggestions = parsed.suggestions?.map((suggestion: any, index: number) => ({
        id: this.generateId(suggestion.scientific_name, index),
        name: suggestion.scientific_name || 'Unknown',
        scientific_name: suggestion.scientific_name || 'Unknown',
        probability: suggestion.confidence || 0,
        common_names: suggestion.common_names || [],
        details: {
          taxonomy: suggestion.taxonomy || {
            kingdom: "Plantae",
            phylum: "Tracheophyta",
            class: "Magnoliopsida",
            order: "Unknown",
            family: suggestion.taxonomy?.family || "Unknown",
            genus: suggestion.taxonomy?.genus || "Unknown",
            species: suggestion.scientific_name || "Unknown"
          },
          reasoning: suggestion.reasoning,
          care_notes: suggestion.care_notes
        }
      })) || [];

      const isPlantProb = parsed.is_plant?.probability || 0;

      return {
        is_plant: {
          probability: isPlantProb,
          threshold: 0.5,
          binary: isPlantProb > 0.5
        },
        classification: {
          suggestions: suggestions
        },
        processing_time_ms: processingTime,
        provider: this.getName()
      };

    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
      
      // Fallback: try to extract plant name from text
      const plantNames = this.extractPlantNamesFromText(responseText);
      
      return {
        is_plant: {
          probability: plantNames.length > 0 ? 0.7 : 0.3,
          threshold: 0.5,
          binary: plantNames.length > 0
        },
        classification: {
          suggestions: plantNames.map((name, index) => ({
            id: this.generateId(name, index),
            name: name,
            scientific_name: name,
            probability: Math.max(0.7 - (index * 0.2), 0.1),
            common_names: [],
            details: {
              reasoning: "Extracted from AI analysis text"
            }
          }))
        },
        processing_time_ms: processingTime,
        provider: this.getName()
      };
    }
  }

  private extractPlantNamesFromText(text: string): string[] {
    // Basic regex to extract scientific names (Genus species format)
    const scientificNameRegex = /[A-Z][a-z]+ [a-z]+/g;
    const matches = text.match(scientificNameRegex) || [];
    
    // Filter to likely plant names and remove duplicates
    return [...new Set(matches)]
      .filter(name => !['OpenAI', 'GPT', 'API'].some(exclude => name.includes(exclude)))
      .slice(0, 3);
  }

  private generateId(scientificName: string, index: number): number {
    // Generate a consistent ID based on scientific name
    let hash = 0;
    for (let i = 0; i < scientificName.length; i++) {
      const char = scientificName.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) + index;
  }
}